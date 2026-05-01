import { NextResponse } from "next/server";

import { createSessionFromSignature } from "@/lib/server/auth";
import algosdk from "algosdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    address?: unknown;
    signedAuthTxn?: unknown;
  } | null;

  if (typeof body?.address !== "string" || !algosdk.isValidAddress(body.address)) {
    return NextResponse.json(
      { error: "A valid Algorand address is required." },
      { status: 400 },
    );
  }

  if (typeof body.signedAuthTxn !== "string" || !body.signedAuthTxn) {
    return NextResponse.json(
      { error: "A signed wallet auth transaction is required." },
      { status: 400 },
    );
  }

  const result = await createSessionFromSignature({
    address: body.address,
    signedAuthTxn: body.signedAuthTxn,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  return NextResponse.json({ address: result.address });
}
