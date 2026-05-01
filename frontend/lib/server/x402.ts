import { ALGORAND_TESTNET_CAIP2, USDC_TESTNET_ASA_ID } from "@x402-avm/avm";
import { registerExactAvmScheme } from "@x402-avm/avm/exact/server";
import { HTTPFacilitatorClient } from "@x402-avm/core/server";
import type { SettleResultContext } from "@x402-avm/core/types";
import { x402ResourceServer } from "@x402-avm/next";
import algosdk from "algosdk";

import {
  PROMPT_ASSET_ID,
  PROMPT_TOP_UP_DISPLAY,
  PROMPT_TOP_UP_PROMPTS,
} from "@/lib/config";
import { addPromptCredits } from "@/lib/server/credits";

export const X402_NETWORK = ALGORAND_TESTNET_CAIP2;
export const X402_USDC_ASSET_ID = USDC_TESTNET_ASA_ID;
export const X402_TOP_UP_PRICE = "$0.50";
export const FACILITATOR_URL =
  process.env.FACILITATOR_URL || "https://facilitator.goplausible.xyz";
export const PAY_TO = process.env.PAY_TO || "";

const facilitatorClient = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
});

export const x402Server = new x402ResourceServer(facilitatorClient);

registerExactAvmScheme(x402Server, { networks: [X402_NETWORK] });

type TopUpResponseBody = {
  topUp?: {
    walletAddress?: unknown;
    credits?: unknown;
  };
};

function parseTopUpResponse(context: SettleResultContext) {
  const responseBody = (
    context.transportContext as { responseBody?: Buffer } | undefined
  )?.responseBody;

  if (!responseBody?.length) {
    return null;
  }

  let parsed: TopUpResponseBody;

  try {
    parsed = JSON.parse(responseBody.toString("utf8")) as TopUpResponseBody;
  } catch {
    return null;
  }

  const walletAddress = parsed.topUp?.walletAddress;
  const credits = parsed.topUp?.credits;

  if (
    typeof walletAddress !== "string" ||
    !algosdk.isValidAddress(walletAddress) ||
    credits !== PROMPT_TOP_UP_PROMPTS
  ) {
    return null;
  }

  return { walletAddress, credits };
}

x402Server.onAfterSettle(async (context) => {
  const topUp = parseTopUpResponse(context);

  if (!topUp) {
    return;
  }

  const payerAddress =
    context.result.payer && algosdk.isValidAddress(context.result.payer)
      ? context.result.payer
      : topUp.walletAddress;

  await addPromptCredits({
    walletAddress: payerAddress,
    credits: topUp.credits,
    payment: {
      transaction: context.result.transaction,
      payer: context.result.payer || payerAddress,
      receiver: context.requirements.payTo,
      network: context.result.network,
      assetId: PROMPT_ASSET_ID,
      amountDisplay: PROMPT_TOP_UP_DISPLAY,
      success: context.result.success,
      x402Version: context.paymentPayload.x402Version,
      facilitatorUrl: FACILITATOR_URL,
      requirements: {
        payTo: context.requirements.payTo,
        amount: context.requirements.amount,
        asset: context.requirements.asset,
      },
    },
  });
});
