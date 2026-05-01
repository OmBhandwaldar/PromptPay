"use client";

import { useEffect, useMemo, useState } from "react";

import { useWallet } from "@txnlab/use-wallet-react";
import type { ClientAvmSigner } from "@x402-avm/avm";
import { registerExactAvmScheme } from "@x402-avm/avm/exact/client";
import {
  decodePaymentResponseHeader,
  wrapFetchWithPayment,
  x402Client,
} from "@x402-avm/fetch";
import algosdk from "algosdk";
import {
  Bot,
  CheckCircle2,
  Coins,
  History,
  Loader2,
  LockKeyhole,
  ReceiptText,
  Wallet,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  ALGOD_TESTNET_URL,
  PROMPT_ASSET_ID,
  PROMPT_NETWORK,
  PROMPT_PRICE_DISPLAY,
  PROMPT_TOP_UP_DISPLAY,
  PROMPT_TOP_UP_PROMPTS,
} from "@/lib/config";
import type { PromptHistoryItem } from "@/lib/server/history";

type PromptResponse = {
  id: string;
  response: string;
  priceDisplay: string;
  network: string;
  payment?: PaymentReceipt;
};

type CreditChallenge = {
  error?: string;
  code?: string;
  topUp?: {
    credits: number;
    priceDisplay: string;
    pricePerPrompt: string;
    network: string;
  };
};

type TopUpResponse = {
  topUp: {
    walletAddress: string;
    credits: number;
    priceDisplay: string;
    assetId: string;
    network: string;
  };
  message: string;
};

type PaymentReceipt = {
  transaction?: string;
  sourceTopUpTransaction?: string;
  network?: string;
  payer?: string;
  receiver?: string;
  amountDisplay?: string;
  creditDebitCredits?: number;
  creditRemainingPrompts?: number;
  topUpPayment?: {
    transaction?: string;
    amountDisplay?: string;
    network?: string;
    payer?: string;
    receiver?: string;
  };
};

type Phase =
  | "idle"
  | "checking-balance"
  | "preparing-payment"
  | "signing-payment"
  | "submitting-payment"
  | "authenticating"
  | "loading-history";

type AlgoStatus = {
  checked: boolean;
  balanceMicroAlgos: bigint;
  minBalanceMicroAlgos: bigint;
  usdcOptedIn: boolean;
  usdcUnits: bigint;
};

type AccountAsset = {
  "asset-id"?: number | bigint;
  assetId?: number | bigint;
  amount?: number | bigint;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function shortAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function findAssetHolding(assets: AccountAsset[], assetId: string) {
  return assets.find((asset) => {
    const currentAssetId = asset["asset-id"] ?? asset.assetId;

    return currentAssetId !== undefined && String(currentAssetId) === assetId;
  });
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error || `Request failed with HTTP ${response.status}.`;
}

export function PremiumPromptApp() {
  const {
    activeAddress,
    activeWallet,
    algodClient,
    isReady,
    signTransactions,
    wallets,
  } = useWallet();
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<PromptResponse | null>(null);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [history, setHistory] = useState<PromptHistoryItem[]>([]);
  const [historyWallet, setHistoryWallet] = useState<string | null>(null);
  const [algoStatus, setAlgoStatus] = useState<AlgoStatus>({
    checked: false,
    balanceMicroAlgos: BigInt(0),
    minBalanceMicroAlgos: BigInt(0),
    usdcOptedIn: false,
    usdcUnits: BigInt(0),
  });
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const x402PaymentFetch = useMemo(() => {
    if (!activeAddress) {
      return null;
    }

    const walletSignTransactions = signTransactions as (
      txns: Uint8Array[],
      indexesToSign?: number[],
    ) => Promise<(Uint8Array | null)[]>;

    const signer: ClientAvmSigner = {
      address: activeAddress,
      signTransactions: async (txns, indexesToSign) =>
        walletSignTransactions(txns, indexesToSign),
    };

    const client = new x402Client();
    registerExactAvmScheme(client, {
      signer,
      algodConfig: { algodUrl: ALGOD_TESTNET_URL },
      networks: [PROMPT_NETWORK],
    });

    return wrapFetchWithPayment(globalThis.fetch.bind(globalThis), client);
  }, [activeAddress, signTransactions]);

  const canSubmit =
    Boolean(activeAddress) && prompt.trim().length > 0 && phase === "idle";
  const activeWalletName = activeWallet?.metadata.name || "No wallet";
  const historyAuthed = Boolean(
    activeAddress && historyWallet === activeAddress,
  );
  const visibleHistory = historyAuthed ? history : [];
  const spendableMicroAlgos =
    algoStatus.balanceMicroAlgos > algoStatus.minBalanceMicroAlgos
      ? algoStatus.balanceMicroAlgos - algoStatus.minBalanceMicroAlgos
      : BigInt(0);
  const requiredSpendableMicroAlgos = BigInt(1000);
  const hasEnoughAlgo = spendableMicroAlgos >= requiredSpendableMicroAlgos;
  const isBusy = phase !== "idle";

  const statusText = useMemo(() => {
    switch (phase) {
      case "checking-balance":
        return "Checking TestNet ALGO fees and USDC opt-in.";
      case "preparing-payment":
        return "Checking credits. If empty, x402 will request a USDC top-up.";
      case "signing-payment":
        return "Waiting for wallet approval for the x402 USDC top-up.";
      case "submitting-payment":
        return "Retrying the prompt after the x402 top-up settles.";
      case "authenticating":
        return "Requesting wallet signature for private history.";
      case "loading-history":
        return "Loading paid prompt history.";
      default:
        return activeAddress
          ? "Ready. Prompts spend credits; the wallet opens only when credits run out."
          : "Connect an Algorand TestNet wallet to begin.";
    }
  }, [activeAddress, phase]);

  useEffect(() => {
    if (!activeAddress) {
      return;
    }

    let cancelled = false;

    fetch("/api/history")
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return (await response.json()) as { records: PromptHistoryItem[] };
      })
      .then((data) => {
        if (!cancelled && data) {
          setHistory(data.records);
          setHistoryWallet(activeAddress);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeAddress]);

  async function connectWallet(walletId: string) {
    const wallet = wallets.find((item) => item.id === walletId);

    if (!wallet) {
      return;
    }

    try {
      setError(null);
      await wallet.connect();
      wallet.setActive();
      setAlgoStatus({
        checked: false,
        balanceMicroAlgos: BigInt(0),
        minBalanceMicroAlgos: BigInt(0),
        usdcOptedIn: false,
        usdcUnits: BigInt(0),
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Wallet connection failed.",
      );
    }
  }

  async function submitPrompt() {
    if (!activeAddress || !canSubmit) {
      return;
    }

    const trimmedPrompt = prompt.trim();

    setError(null);
    setResult(null);
    setReceipt(null);

    try {
      setPhase("preparing-payment");
      const firstResponse = await requestPrompt(trimmedPrompt);

      if (firstResponse.ok) {
        const data = (await firstResponse.json()) as PromptResponse;

        await completePrompt(data);
        return;
      }

      if (firstResponse.status !== 402) {
        throw new Error(await readError(firstResponse));
      }

      const challenge = (await firstResponse.json()) as CreditChallenge;

      if (challenge.code !== "credits_required") {
        throw new Error(challenge.error || "Payment challenge was missing.");
      }

      setPhase("signing-payment");
      const topUp = await topUpCredits();

      setReceipt({
        transaction: topUp.paymentResponse?.transaction,
        network: topUp.paymentResponse?.network || PROMPT_NETWORK,
        payer: topUp.paymentResponse?.payer,
        amountDisplay: PROMPT_TOP_UP_DISPLAY,
        creditRemainingPrompts: topUp.response.topUp.credits,
      });

      setPhase("submitting-payment");
      const paidResponse = await requestPrompt(trimmedPrompt);

      if (!paidResponse.ok) {
        throw new Error(await readError(paidResponse));
      }

      const data = (await paidResponse.json()) as PromptResponse;

      await completePrompt(data);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to complete paid prompt.",
      );
    } finally {
      setPhase("idle");
    }
  }

  async function requestPrompt(promptText: string) {
    return fetch("/api/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: activeAddress, prompt: promptText }),
    });
  }

  async function topUpCredits() {
    if (!activeAddress || !x402PaymentFetch) {
      throw new Error("Connect a wallet before buying prompt credits.");
    }

    const response = await x402PaymentFetch("/api/credits/topup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: activeAddress }),
    });

    if (!response.ok) {
      throw new Error(await readError(response));
    }

    const paymentHeader =
      response.headers.get("PAYMENT-RESPONSE") ||
      response.headers.get("X-PAYMENT-RESPONSE");
    const paymentResponse = paymentHeader
      ? decodePaymentResponseHeader(paymentHeader)
      : null;
    const topUpResponse = (await response.json()) as TopUpResponse;

    return {
      response: topUpResponse,
      paymentResponse,
    };
  }

  async function completePrompt(data: PromptResponse) {
    setResult(data);
    setReceipt(data.payment || null);

    if (historyAuthed) {
      await loadHistory();
    }
  }

  async function authenticateHistory() {
    if (!activeAddress) {
      setError("Connect a wallet before loading history.");
      return;
    }

    setError(null);
    setPhase("authenticating");

    try {
      const nonceResponse = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: activeAddress }),
      });

      if (!nonceResponse.ok) {
        throw new Error(await readError(nonceResponse));
      }

      const { message } = (await nonceResponse.json()) as { message: string };
      const suggestedParams = await algodClient.getTransactionParams().do();
      const authTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: activeAddress,
        receiver: activeAddress,
        amount: 0,
        note: new TextEncoder().encode(message),
        suggestedParams,
      });
      const signed = await signTransactions([authTxn], [0]);
      const signedAuthTxn = signed[0];

      if (!signedAuthTxn) {
        throw new Error("Wallet did not return a signed auth transaction.");
      }

      const sessionResponse = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: activeAddress,
          signedAuthTxn: bytesToBase64(signedAuthTxn),
        }),
      });

      if (!sessionResponse.ok) {
        throw new Error(await readError(sessionResponse));
      }

      setHistoryWallet(activeAddress);
      await loadHistory();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to authenticate history access.",
      );
    } finally {
      setPhase("idle");
    }
  }

  async function checkAlgoStatus(options: { resetPhase?: boolean } = {}) {
    if (!activeAddress) {
      throw new Error("Connect a wallet before checking setup.");
    }

    setPhase("checking-balance");

    const account = await algodClient.accountInformation(activeAddress).do();
    const usdcHolding = findAssetHolding(
      Array.isArray(account.assets) ? account.assets : [],
      PROMPT_ASSET_ID,
    );
    const nextStatus = {
      checked: true as const,
      balanceMicroAlgos: account.amount,
      minBalanceMicroAlgos: account.minBalance,
      usdcOptedIn: Boolean(usdcHolding),
      usdcUnits: BigInt(usdcHolding?.amount || 0),
    };

    setAlgoStatus(nextStatus);

    if (options.resetPhase !== false) {
      setPhase("idle");
    }

    return nextStatus;
  }

  function formatAlgos(amountMicroAlgos: bigint | number) {
    return (Number(amountMicroAlgos) / 1_000_000).toLocaleString(undefined, {
      maximumFractionDigits: 6,
      minimumFractionDigits: 0,
    });
  }

  function formatUsdc(amountUnits: bigint | number) {
    return (Number(amountUnits) / 1_000_000).toLocaleString(undefined, {
      maximumFractionDigits: 6,
      minimumFractionDigits: 0,
    });
  }

  async function loadHistory() {
    setPhase("loading-history");

    try {
      const response = await fetch("/api/history");

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = (await response.json()) as {
        records: PromptHistoryItem[];
      };
      setHistory(data.records);
    } finally {
      setPhase("idle");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="space-y-6">
        <Card className="overflow-hidden">
          <CardHeader className="gap-4 border-b bg-primary pb-5 text-primary-foreground">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <Badge className="border-white bg-white text-black">
                  <Bot className="size-3.5" />
                  LLM premium prompt
                </Badge>
                <CardTitle className="text-2xl sm:text-3xl">
                  Run a paid prompt
                </CardTitle>
                <CardDescription className="max-w-2xl text-base leading-7 text-white">
                  The API spends stored prompt credits first. If credits are
                  empty, x402 opens your wallet once for a{" "}
                  {PROMPT_TOP_UP_PROMPTS}-credit {PROMPT_TOP_UP_DISPLAY}{" "}
                  TestNet USDC top-up.
                </CardDescription>
              </div>
              <Badge
                className="max-w-full border-white bg-white text-black"
              >
                {activeAddress ? shortAddress(activeAddress) : "No wallet"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-primary p-2 text-primary-foreground">
                  {isBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                </div>
                <div>
                  <p className="font-medium">Payment gate status</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {statusText}
                  </p>
                </div>
              </div>
            </div>

            <Textarea
              className="min-h-56 resize-y bg-white p-4 text-base leading-7"
              maxLength={2000}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Ask for strategy, code, product advice, copy, or any premium answer you want LLM to generate..."
              value={prompt}
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {prompt.trim().length}/2000 characters
              </p>
              <Button
                className="h-11"
                disabled={!canSubmit}
                onClick={submitPrompt}
                type="button"
              >
                {isBusy ? <Loader2 className="animate-spin" /> : <Bot />}
                Run prompt
              </Button>
            </div>

            {error ? (
              <div className="rounded-lg border bg-white p-4 text-sm font-medium leading-6 text-foreground">
                {error}
              </div>
            ) : null}

            {result ? (
              <section className="rounded-lg border bg-white p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                      <Bot className="size-4" />
                    </span>
                    <h3 className="font-semibold text-foreground">
                      Premium response
                    </h3>
                  </div>
                  <Badge variant="outline">Record {result.id.slice(0, 8)}</Badge>
                </div>
                <MarkdownResponse className="mt-4" content={result.response} />
              </section>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <aside className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Wallet className="size-4" />
              Wallet
            </CardTitle>
            <CardDescription>Active: {activeWalletName}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              {wallets.map((wallet) => (
                <Button
                  className="h-11 justify-between"
                  disabled={!isReady}
                  key={wallet.walletKey}
                  onClick={() => connectWallet(wallet.id)}
                  type="button"
                  variant={wallet.isActive ? "secondary" : "outline"}
                >
                  <span>{wallet.metadata.name}</span>
                  <Badge
                    variant={wallet.isActive ? "success" : "outline"}
                    className="ml-2"
                  >
                    {wallet.isActive
                      ? "Active"
                      : wallet.isConnected
                        ? "Connected"
                        : "Connect"}
                  </Badge>
                </Button>
              ))}
            </div>

            <Separator />

            <div className="rounded-lg border bg-white p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    <Coins className="size-4 text-foreground" />
                    Setup
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {algoStatus.checked
                      ? `${formatAlgos(spendableMicroAlgos)} spendable ALGO, ${formatUsdc(algoStatus.usdcUnits)} USDC`
                      : "Check ALGO fees and USDC opt-in"}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Wallet and PAY_TO must be opted into TestNet USDC ASA{" "}
                    {PROMPT_ASSET_ID}. ALGO is only needed for network fees.
                  </p>
                </div>
                <Badge
                  variant={
                    hasEnoughAlgo && algoStatus.usdcOptedIn
                      ? "default"
                      : "secondary"
                  }
                >
                  {hasEnoughAlgo && algoStatus.usdcOptedIn
                    ? "Ready"
                    : "Needed"}
                </Badge>
              </div>
              <Button
                className="mt-4 w-full"
                disabled={!activeAddress || phase !== "idle"}
                onClick={() => {
                  checkAlgoStatus().catch((caught) => {
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : "Unable to check wallet setup.",
                    );
                    setPhase("idle");
                  });
                }}
                type="button"
                variant="outline"
              >
                Check setup
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ReceiptText className="size-4" />
                  Receipt
                </CardTitle>
                <CardDescription>
                  Top-up transaction plus remaining credits.
                </CardDescription>
              </div>
              <Badge variant="secondary">{PROMPT_PRICE_DISPLAY}/prompt</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {receipt ? (
              <dl className="space-y-3 text-sm">
                <ReceiptRow
                  label="Network"
                  value={receipt.network || PROMPT_NETWORK}
                />
                <ReceiptRow
                  label="Transaction"
                  value={
                    receipt.transaction ||
                    receipt.sourceTopUpTransaction ||
                    receipt.topUpPayment?.transaction ||
                    "Credit spend"
                  }
                />
                <ReceiptRow
                  label="Top-up"
                  value={
                    receipt.topUpPayment?.amountDisplay ||
                    receipt.amountDisplay ||
                    PROMPT_TOP_UP_DISPLAY
                  }
                />
                <ReceiptRow
                  label="Prompt debit"
                  value={
                    receipt.creditDebitCredits
                      ? `${receipt.creditDebitCredits} credit`
                      : PROMPT_PRICE_DISPLAY
                  }
                />
                <ReceiptRow
                  label="Credits left"
                  value={
                    receipt.creditRemainingPrompts !== undefined
                      ? `${receipt.creditRemainingPrompts} prompts`
                      : "Unknown"
                  }
                />
                <ReceiptRow label="Payer" value={receipt.payer || "Unknown"} />
              </dl>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                No paid request has completed in this session.
              </p>
            )}
          </CardContent>
        </Card>
      </aside>

      <section className="lg:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <History className="size-4" />
                  History
                </CardTitle>
                <CardDescription>Wallet-signed private records.</CardDescription>
              </div>
              <Button
                disabled={!activeAddress || phase !== "idle"}
                onClick={authenticateHistory}
                type="button"
                variant="outline"
              >
                <LockKeyhole />
                {historyAuthed ? "Refresh" : "Sign in"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {visibleHistory.length > 0 ? (
              <Accordion
                className="rounded-lg border bg-white px-4"
                collapsible
                type="single"
              >
                {visibleHistory.map((item) => (
                  <AccordionItem
                    className="border-foreground"
                    key={item.id}
                    value={item.id}
                  >
                    <AccordionTrigger>
                      <div className="min-w-0 space-y-1">
                        <p className="line-clamp-1 break-words font-medium">
                          {item.prompt}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(item.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,320px)]">
                        <div>
                          <p className="text-xs font-medium uppercase">
                            Response
                          </p>
                          <MarkdownResponse
                            className="mt-2 text-muted-foreground"
                            content={item.response}
                          />
                        </div>
                        <div className="rounded-md border bg-white p-3">
                          <p className="text-xs font-medium uppercase">
                            Source top-up
                          </p>
                          <p className="mt-2 break-all font-mono text-xs leading-5 text-muted-foreground">
                            {item.payment.transaction ||
                              item.payment.sourceTopUpTransaction ||
                              "credit spend"}
                          </p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <div className="rounded-lg border bg-white p-4">
                <p className="text-sm leading-6 text-muted-foreground">
                  {activeAddress
                    ? "Sign with your wallet to load saved prompt records."
                    : "Connect a wallet to view history."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="break-all text-foreground">{value}</dd>
    </div>
  );
}

function MarkdownResponse({
  className,
  content,
}: {
  className?: string;
  content: string;
}) {
  return (
    <div
      className={[
        "max-w-none space-y-3 break-words text-sm leading-7",
        "[&_a]:break-all [&_a]:font-medium [&_a]:underline",
        "[&_blockquote]:border-l [&_blockquote]:pl-4",
        "[&_code]:rounded-md [&_code]:border [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs",
        "[&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold",
        "[&_li]:ml-5 [&_li]:list-disc",
        "[&_ol>li]:list-decimal",
        "[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:p-3",
        className || "",
      ].join(" ")}
    >
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
