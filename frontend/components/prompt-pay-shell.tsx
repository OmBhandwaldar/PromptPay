"use client";

import { useState } from "react";
import type { ComponentType } from "react";

import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Coins,
  CreditCard,
  LockKeyhole,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react";

import { PremiumPromptApp } from "@/components/premium-prompt-app";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PROMPT_PRICE_DISPLAY,
  PROMPT_TOP_UP_DISPLAY,
  PROMPT_TOP_UP_PROMPTS,
} from "@/lib/config";

const flow = [
  {
    icon: Wallet,
    title: "Connect wallet",
    description: "Pera, Defly, or Lute on Algorand TestNet.",
  },
  {
    icon: CreditCard,
    title: "Top up credits",
    description: `${PROMPT_TOP_UP_DISPLAY} funds ${PROMPT_TOP_UP_PROMPTS} prompts.`,
  },
  {
    icon: Bot,
    title: "Generate with LLM",
    description: "The backend calls LLM only after payment is verified.",
  },
];

const proofPoints = [
  "Official x402 USDC top-up",
  "402 payment challenge",
  "Trusted credit ledger",
  "LLM's are run on server-side only",
];

export function PromptPayShell() {
  const [tab, setTab] = useState("home");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <Tabs value={tab} onValueChange={setTab} className="gap-6">
          <header className="flex flex-col gap-4 rounded-lg border bg-primary p-4 text-primary-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-lg border border-white bg-white text-black">
                <Zap className="size-5" />
              </div>
              <div>
                <p className="text-lg font-semibold leading-none">Prompt Pay</p>
                <p className="mt-1 text-sm text-white">
                  Algorand payments for premium AI prompts
                </p>
              </div>
            </div>
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="home" className="flex-1 sm:flex-none">
                Home
              </TabsTrigger>
              <TabsTrigger value="prompt" className="flex-1 sm:flex-none">
                Premium prompt
              </TabsTrigger>
            </TabsList>
          </header>
          <TabsContent value="home">
            <HomeTab onStart={() => setTab("prompt")} />
          </TabsContent>
          <TabsContent value="prompt">
            <PremiumPromptApp />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function HomeTab({ onStart }: { onStart: () => void }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-stretch">
        <div className="rounded-lg border bg-primary p-6 text-primary-foreground sm:p-8">
          <div className="flex flex-wrap gap-2">
            <Badge className="border-white bg-white text-black">
              <ShieldCheck className="size-3.5" />
              Payment before inference
            </Badge>
            <Badge className="border-white bg-black text-white">
              TestNet MVP
            </Badge>
          </div>

          <div className="mt-8 max-w-3xl">
            <h1 className="text-4xl font-semibold leading-tight text-balance sm:text-5xl">
              Monetize premium prompts with Algorand-native credits.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white">
              Prompt Pay turns premium AI access into an x402 payment event.
              Users top up once with TestNet USDC, then prompts run from credits
              without reopening the wallet until credits are empty.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              className="h-11 border-white bg-white text-black hover:bg-black hover:text-white"
              onClick={onStart}
              type="button"
            >
              Open premium prompt
              <ArrowRight />
            </Button>
            <div className="rounded-lg border border-white px-4 py-3 text-sm text-white">
              {PROMPT_PRICE_DISPLAY} per prompt after a {PROMPT_TOP_UP_DISPLAY}{" "}
              top-up
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Live payment flow</CardTitle>
            <CardDescription>
              The app keeps the paid generation path explicit and auditable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {flow.map((item, index) => (
              <div className="flex gap-3" key={item.title}>
                <div className="flex flex-col items-center">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <item.icon className="size-4" />
                  </span>
                  {index < flow.length - 1 ? (
                  <span className="my-2 h-8 w-px bg-foreground" />
                  ) : null}
                </div>
                <div className="pb-4">
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {proofPoints.map((point) => (
          <Card key={point}>
            <CardContent className="flex items-center gap-3 p-4">
              <CheckCircle2 className="size-5 text-foreground" />
              <p className="text-sm font-medium">{point}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <FeatureCard
          icon={Coins}
          title="Credit ledger"
          description="Mongo stores wallet balances and prompt history so repeated prompts do not need repeated wallet approvals."
        />
        <FeatureCard
          icon={LockKeyhole}
          title="Protected backend"
          description="The API returns 402 when credits are missing and only calls Gemini after the paid path succeeds."
        />
        <FeatureCard
          icon={Bot}
          title="Server LLM"
          description="LLM runs from the backend with the API key kept out of the client bundle."
        />
      </section>
    </div>
  );
}

function FeatureCard({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Icon className="size-5" />
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription className="leading-6">{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
