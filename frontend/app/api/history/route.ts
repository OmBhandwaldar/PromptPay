import { NextResponse } from "next/server";

import { getSession } from "@/lib/server/auth";
import { listPromptHistory } from "@/lib/server/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Wallet authentication is required." },
      { status: 401 },
    );
  }

  const records = await listPromptHistory(session.address);

  return NextResponse.json({ records });
}
