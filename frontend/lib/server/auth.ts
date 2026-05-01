import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import algosdk from "algosdk";
import { cookies } from "next/headers";
import nacl from "tweetnacl";

import { APP_NAME } from "@/lib/config";
import { getRequiredEnv } from "@/lib/server/env";

const NONCE_COOKIE = "prompt_pay_nonce";
const SESSION_COOKIE = "prompt_pay_session";
const NONCE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

type SignedEnvelope<T> = {
  payload: T;
  signature: string;
};

type NoncePayload = {
  address: string;
  message: string;
  expiresAt: number;
};

export type SessionPayload = {
  address: string;
  expiresAt: number;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string): string {
  return createHmac("sha256", getRequiredEnv("AUTH_SECRET"))
    .update(payload)
    .digest("base64url");
}

function createSignedToken<T>(payload: T): string {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const envelope: SignedEnvelope<string> = {
    payload: encodedPayload,
    signature: signPayload(encodedPayload),
  };

  return base64UrlEncode(JSON.stringify(envelope));
}

function verifySignedToken<T>(token: string): T | null {
  try {
    const envelope = JSON.parse(base64UrlDecode(token)) as SignedEnvelope<string>;
    const expected = signPayload(envelope.payload);
    const expectedBytes = Buffer.from(expected);
    const actualBytes = Buffer.from(envelope.signature);

    if (
      expectedBytes.length !== actualBytes.length ||
      !timingSafeEqual(expectedBytes, actualBytes)
    ) {
      return null;
    }

    return JSON.parse(base64UrlDecode(envelope.payload)) as T;
  } catch {
    return null;
  }
}

function getCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function createAuthMessage(address: string): NoncePayload {
  const nonce = randomBytes(24).toString("base64url");
  const issuedAt = new Date().toISOString();
  const expiresAt = Date.now() + NONCE_TTL_MS;
  const message = [
    `${APP_NAME} history access`,
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");

  return { address, message, expiresAt };
}

export async function setNonceCookie(payload: NoncePayload) {
  const cookieStore = await cookies();
  cookieStore.set(
    NONCE_COOKIE,
    createSignedToken(payload),
    getCookieOptions(NONCE_TTL_MS / 1000),
  );
}

export async function createSessionFromSignature(input: {
  address: string;
  signedAuthTxn: string;
}) {
  const cookieStore = await cookies();
  const nonceToken = cookieStore.get(NONCE_COOKIE)?.value;
  const nonce = nonceToken
    ? verifySignedToken<NoncePayload>(nonceToken)
    : null;

  if (!nonce || nonce.expiresAt < Date.now()) {
    return { ok: false, error: "Auth challenge expired. Request a new nonce." };
  }

  if (nonce.address !== input.address) {
    return { ok: false, error: "Signed address does not match challenge." };
  }

  let signedTxn: algosdk.SignedTransaction;

  try {
    signedTxn = algosdk.decodeSignedTransaction(
      Uint8Array.from(Buffer.from(input.signedAuthTxn, "base64")),
    );
  } catch {
    return { ok: false, error: "Invalid wallet auth transaction." };
  }

  const txn = signedTxn.txn;
  const note = new TextDecoder().decode(txn.note);
  const sender = txn.sender.toString();
  const receiver = txn.payment?.receiver.toString();
  const isValidSignature = signedTxn.sig
    ? nacl.sign.detached.verify(
        txn.bytesToSign(),
        signedTxn.sig,
        txn.sender.publicKey,
      )
    : false;

  if (
    !isValidSignature ||
    txn.type !== "pay" ||
    sender !== input.address ||
    receiver !== input.address ||
    txn.payment?.amount !== BigInt(0) ||
    note !== nonce.message ||
    txn.rekeyTo
  ) {
    return { ok: false, error: "Invalid wallet auth transaction." };
  }

  const session: SessionPayload = {
    address: input.address,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };

  cookieStore.set(
    SESSION_COOKIE,
    createSignedToken(session),
    getCookieOptions(SESSION_TTL_MS / 1000),
  );
  cookieStore.delete(NONCE_COOKIE);

  return { ok: true, address: input.address };
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? verifySignedToken<SessionPayload>(token) : null;

  if (!session || session.expiresAt < Date.now()) {
    return null;
  }

  return session;
}
