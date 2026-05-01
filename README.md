<h1 align="center">Prompt Pay</h1>

<p align="center">
  Algorand x402 payments for premium AI prompts.
</p>

Prompt Pay is a focused Next.js MVP where users buy prompt credits with TestNet
USDC, then spend those credits on LLM-powered responses. The backend only
calls the model after an official x402 payment succeeds or an existing credit is
available.

## Flow

1. Connect an Algorand TestNet wallet.
2. Submit a premium prompt.
3. If credits are empty, x402 asks for a one-time `0.50 USDC` top-up.
4. The top-up adds `10` prompt credits.
5. Each prompt spends `1` credit and then calls Gemini.

## Stack

`Next.js App Router` · `Algorand TestNet` · `@x402-avm/*` · `GoPlausible`
· `TestNet USDC ASA 10458941` · `MongoDB` · `Gemini`

## Setup

```bash
cd frontend
pnpm install
cp .env.example .env
```

Required env:

```env
PAY_TO=YOUR_MERCHANT_ALGORAND_TESTNET_ADDRESS
FACILITATOR_URL=https://facilitator.goplausible.xyz
MONGODB_URI=YOUR_MONGODB_URI
MONGODB_DB=prompt_pay
AUTH_SECRET=YOUR_RANDOM_SECRET
GEMINI_API_KEY=YOUR_GEMINI_KEY
GEMINI_MODEL=gemini-3-flash-preview
```

Make sure the paying wallet and `PAY_TO` wallet are both opted into TestNet USDC
ASA `10458941`. The paying wallet also needs TestNet ALGO for fees.

## Run

```bash
cd frontend
pnpm run dev
```

Open `http://localhost:3000`.

## Verify

```bash
cd frontend
pnpm run lint
pnpm run build
```
