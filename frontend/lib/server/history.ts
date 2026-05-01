import type { Document, WithId } from "mongodb";

import {
  PROMPT_ASSET_ID,
  PROMPT_NETWORK,
  PROMPT_PRICE_DISPLAY,
} from "@/lib/config";
import { getMongoDb } from "@/lib/server/mongo";

export type PromptHistoryRecord = {
  walletAddress: string;
  prompt: string;
  response: string;
  priceDisplay: string;
  assetId: string;
  network: string;
  payment: {
    payer?: string;
    receiver?: string;
    transaction?: string;
    success?: boolean;
    amountDisplay?: string;
    confirmedRound?: number;
    creditDebitCredits?: number;
    creditRemainingPrompts?: number;
    sourceTopUpTransaction?: string;
    topUpPayment?: unknown;
    errorReason?: string;
    errorMessage?: string;
  };
  status: "completed";
  createdAt: Date;
  updatedAt: Date;
};

export type PromptHistoryItem = Omit<
  PromptHistoryRecord,
  "createdAt" | "updatedAt"
> & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

function serializeRecord(record: WithId<Document>): PromptHistoryItem {
  return {
    id: record._id.toString(),
    walletAddress: record.walletAddress,
    prompt: record.prompt,
    response: record.response,
    priceDisplay: record.priceDisplay || record.priceUsd || "",
    assetId: record.assetId,
    network: record.network,
    payment: record.payment,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function savePromptHistory(input: {
  walletAddress: string;
  prompt: string;
  response: string;
  payment: PromptHistoryRecord["payment"];
}) {
  const now = new Date();
  const db = await getMongoDb();
  const result = await db.collection("prompt_requests").insertOne({
    walletAddress: input.walletAddress,
    prompt: input.prompt,
    response: input.response,
    priceDisplay: PROMPT_PRICE_DISPLAY,
    assetId: PROMPT_ASSET_ID,
    network: PROMPT_NETWORK,
    payment: input.payment,
    status: "completed",
    createdAt: now,
    updatedAt: now,
  } satisfies PromptHistoryRecord);

  return result.insertedId.toString();
}

export async function ensurePromptHistoryStore() {
  const db = await getMongoDb();
  await db.command({ ping: 1 });
}

export async function listPromptHistory(walletAddress: string) {
  const db = await getMongoDb();
  const records = await db
    .collection("prompt_requests")
    .find({ walletAddress })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  return records.map(serializeRecord);
}
