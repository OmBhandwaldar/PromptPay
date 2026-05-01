import { PROMPT_TOP_UP_PROMPTS } from "@/lib/config";
import { getMongoDb } from "@/lib/server/mongo";

const BALANCES_COLLECTION = "prompt_credit_balances";
const TOP_UPS_COLLECTION = "prompt_credit_topups";

export type PromptTopUpPayment = {
  transaction?: string;
  payer?: string;
  receiver?: string;
  network?: string;
  assetId?: string;
  amountDisplay?: string;
  success?: boolean;
  x402Version?: number;
  facilitatorUrl?: string;
  requirements?: {
    payTo?: string;
    amount?: string;
    asset?: string;
  };
};

export type PromptCreditBalance = {
  walletAddress: string;
  credits: number;
  lastTopUpPayment?: PromptTopUpPayment;
  lastTopUpAt?: Date;
  updatedAt: Date;
  createdAt: Date;
};

export type PromptCreditDebit = {
  credits: number;
  remainingPrompts: number;
  lastTopUpPayment?: PromptTopUpPayment;
};

export type PromptCreditTopUp = {
  walletAddress: string;
  credits: number;
  payment: PromptTopUpPayment;
  createdAt: Date;
  updatedAt: Date;
};

function serializeCredits(
  record?: PromptCreditBalance | null,
): PromptCreditDebit {
  const credits = record?.credits || 0;

  return {
    credits,
    remainingPrompts: credits,
    lastTopUpPayment: record?.lastTopUpPayment,
  };
}

async function getCreditDb() {
  const db = await getMongoDb();

  await Promise.all([
    db
      .collection<PromptCreditBalance>(BALANCES_COLLECTION)
      .createIndex({ walletAddress: 1 }, { unique: true }),
    db
      .collection<PromptCreditTopUp>(TOP_UPS_COLLECTION)
      .createIndex({ "payment.transaction": 1 }, { unique: true, sparse: true }),
  ]);

  return db;
}

export async function getPromptCredits(
  walletAddress: string,
): Promise<PromptCreditDebit> {
  const db = await getCreditDb();
  const record = await db
    .collection<PromptCreditBalance>(BALANCES_COLLECTION)
    .findOne({ walletAddress });

  return serializeCredits(record);
}

export async function addPromptCredits(input: {
  walletAddress: string;
  credits: number;
  payment?: PromptTopUpPayment;
}): Promise<PromptCreditDebit> {
  const db = await getCreditDb();
  const now = new Date();

  if (input.payment?.transaction) {
    const topUpResult = await db
      .collection<PromptCreditTopUp>(TOP_UPS_COLLECTION)
      .updateOne(
        { "payment.transaction": input.payment.transaction },
        {
          $setOnInsert: {
            walletAddress: input.walletAddress,
            credits: input.credits,
            payment: input.payment,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true },
      );

    if (!topUpResult.upsertedId) {
      return getPromptCredits(input.walletAddress);
    }
  }

  const result = await db
    .collection<PromptCreditBalance>(BALANCES_COLLECTION)
    .findOneAndUpdate(
      { walletAddress: input.walletAddress },
      {
        $setOnInsert: {
          walletAddress: input.walletAddress,
          createdAt: now,
        },
        $inc: { credits: input.credits },
        $set: {
          ...(input.payment
            ? {
                lastTopUpAt: now,
                lastTopUpPayment: input.payment,
              }
            : {}),
          updatedAt: now,
        },
      },
      { returnDocument: "after", upsert: true },
    );

  return serializeCredits(result);
}

export async function consumePromptCredit(
  walletAddress: string,
): Promise<PromptCreditDebit | null> {
  const db = await getCreditDb();
  const now = new Date();
  const result = await db
    .collection<PromptCreditBalance>(BALANCES_COLLECTION)
    .findOneAndUpdate(
      {
        walletAddress,
        credits: { $gte: 1 },
      },
      {
        $inc: { credits: -1 },
        $set: { updatedAt: now },
        $setOnInsert: { walletAddress, createdAt: now },
      },
      { returnDocument: "after" },
    );

  if (!result) {
    return null;
  }

  return serializeCredits(result);
}

export async function refundPromptCredit(walletAddress: string) {
  return addPromptCredits({
    walletAddress,
    credits: 1,
  });
}

export function promptCreditsFromTopUp() {
  return PROMPT_TOP_UP_PROMPTS;
}
