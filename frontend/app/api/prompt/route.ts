import algosdk from "algosdk";
import { NextRequest, NextResponse } from "next/server";

import {
  PROMPT_NETWORK,
  PROMPT_PRICE_DISPLAY,
  PROMPT_TOP_UP_DISPLAY,
  PROMPT_TOP_UP_PROMPTS,
} from "@/lib/config";
import { consumePromptCredit, refundPromptCredit } from "@/lib/server/credits";
import { generatePremiumResponse } from "@/lib/server/gemini";
import { ensurePromptHistoryStore, savePromptHistory } from "@/lib/server/history";
import { validatePrompt } from "@/lib/server/prompt-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PromptBody = {
  prompt?: unknown;
  address?: unknown;
};

export async function POST(request: NextRequest) {
  let body: PromptBody;

  try {
    body = (await request.json()) as PromptBody;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const promptResult = validatePrompt(body);

  if (!promptResult.ok) {
    return NextResponse.json({ error: promptResult.error }, { status: 400 });
  }

  try {
    await ensurePromptHistoryStore();

    if (
      typeof body.address !== "string" ||
      !algosdk.isValidAddress(body.address)
    ) {
      return NextResponse.json(
        { error: "A valid wallet address is required for prompt credits." },
        { status: 400 },
      );
    }

    const debit = await consumePromptCredit(body.address);

    if (!debit) {
      return NextResponse.json(
        {
          error: "Prompt credits are required.",
          code: "credits_required",
          topUp: {
            credits: PROMPT_TOP_UP_PROMPTS,
            priceDisplay: PROMPT_TOP_UP_DISPLAY,
            pricePerPrompt: PROMPT_PRICE_DISPLAY,
            network: PROMPT_NETWORK,
          },
        },
        { status: 402 },
      );
    }

    let response: string;

    try {
      response = await generatePremiumResponse(promptResult.prompt);
    } catch (error) {
      await refundPromptCredit(body.address);
      throw error;
    }

    const id = await savePromptHistory({
      walletAddress: body.address,
      prompt: promptResult.prompt,
      response,
      payment: {
        payer: body.address,
        receiver: debit.lastTopUpPayment?.receiver,
        sourceTopUpTransaction: debit.lastTopUpPayment?.transaction,
        success: true,
        amountDisplay: PROMPT_PRICE_DISPLAY,
        creditDebitCredits: 1,
        creditRemainingPrompts: debit.remainingPrompts,
        topUpPayment: debit.lastTopUpPayment,
      },
    });

    return NextResponse.json({
      id,
      response,
      priceDisplay: PROMPT_PRICE_DISPLAY,
      network: PROMPT_NETWORK,
      payment: {
        payer: body.address,
        receiver: debit.lastTopUpPayment?.receiver,
        sourceTopUpTransaction: debit.lastTopUpPayment?.transaction,
        amountDisplay: PROMPT_PRICE_DISPLAY,
        creditDebitCredits: 1,
        creditRemainingPrompts: debit.remainingPrompts,
        topUpPayment: debit.lastTopUpPayment,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to process paid prompt.",
      },
      { status: 500 },
    );
  }
}
