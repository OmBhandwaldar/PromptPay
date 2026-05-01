import { withX402 } from "@x402-avm/next";
import algosdk from "algosdk";
import { NextRequest, NextResponse } from "next/server";

import {
  PROMPT_ASSET_ID,
  PROMPT_NETWORK,
  PROMPT_TOP_UP_DISPLAY,
  PROMPT_TOP_UP_PROMPTS,
} from "@/lib/config";
import {
  PAY_TO,
  X402_NETWORK,
  X402_TOP_UP_PRICE,
  X402_USDC_ASSET_ID,
  x402Server,
} from "@/lib/server/x402";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TopUpBody = {
  address?: unknown;
};

async function handler(request: NextRequest): Promise<NextResponse<unknown>> {
  let body: TopUpBody;

  try {
    body = (await request.json()) as TopUpBody;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (typeof body.address !== "string" || !algosdk.isValidAddress(body.address)) {
    return NextResponse.json(
      { error: "A valid wallet address is required for credit top-up." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    topUp: {
      walletAddress: body.address,
      credits: PROMPT_TOP_UP_PROMPTS,
      priceDisplay: PROMPT_TOP_UP_DISPLAY,
      assetId: PROMPT_ASSET_ID,
      network: PROMPT_NETWORK,
    },
    message: "x402 payment settled. Prompt credits are available now.",
  });
}

export const POST = withX402(
  handler,
  {
    accepts: {
      scheme: "exact",
      network: X402_NETWORK,
      payTo: PAY_TO,
      price: X402_TOP_UP_PRICE,
      extra: {
        asset: X402_USDC_ASSET_ID,
      },
    },
    description: "Prompt Pay credit top-up",
    unpaidResponseBody: () => ({
      contentType: "application/json",
      body: {
        error: "x402 payment required for USDC credit top-up.",
        topUp: {
          credits: PROMPT_TOP_UP_PROMPTS,
          priceDisplay: PROMPT_TOP_UP_DISPLAY,
          assetId: PROMPT_ASSET_ID,
          network: PROMPT_NETWORK,
        },
      },
    }),
    settlementFailedResponseBody: (_context, settlement) => ({
      contentType: "application/json",
      body: {
        error: settlement.errorMessage || settlement.errorReason,
        transaction: settlement.transaction,
        network: settlement.network,
      },
    }),
  },
  x402Server,
);
