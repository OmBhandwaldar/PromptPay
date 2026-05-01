import { NextResponse } from "next/server";

import { createAuthMessage, setNonceCookie } from "@/lib/server/auth";
import algosdk from "algosdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    address?: unknown;
  } | null;

  if (typeof body?.address !== "string" || !algosdk.isValidAddress(body.address)) {
    return NextResponse.json(
      { error: "A valid Algorand address is required." },
      { status: 400 },
    );
  }

  const challenge = createAuthMessage(body.address);
  await setNonceCookie(challenge);

  return NextResponse.json({ message: challenge.message });
}
