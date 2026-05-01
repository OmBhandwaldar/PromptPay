const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_TIMEOUT_MS = 45_000;

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

function getGeminiApiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GENERATE_API_KEY
  );
}

function getGeminiModel() {
  return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
}

function getGeminiEndpoint() {
  const baseUrl = process.env.GEMINI_API_BASE || DEFAULT_GEMINI_API_BASE;
  const modelName = getGeminiModel().replace(/^models\//, "");

  return `${baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(
    modelName,
  )}:generateContent`;
}

function extractGeminiText(data: GeminiGenerateResponse) {
  return (
    data.candidates
      ?.flatMap((candidate) => candidate.content?.parts || [])
      .map((part) => part.text)
      .filter((text): text is string => Boolean(text?.trim()))
      .join("\n")
      .trim() || ""
  );
}

export async function generatePremiumResponse(prompt: string): Promise<string> {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    throw new Error(
      "Missing Gemini API key. Set GEMINI_API_KEY in the frontend .env file.",
    );
  }

  const response = await fetch(getGeminiEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    body: JSON.stringify({
      system_instruction: {
        parts: [
          {
            text: [
              "You are the premium AI response engine for Prompt Pay.",
              "Answer the user's prompt directly with practical, high-signal detail.",
              "Be concise when the task is simple and structured when the task is complex.",
              "Do not mention payment, credits, wallets, or implementation internals unless the user asks.",
            ].join(" "),
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: 1400,
        responseMimeType: "text/plain",
      },
    }),
  });

  const data = (await response.json().catch(() => ({}))) as GeminiGenerateResponse;

  if (!response.ok) {
    throw new Error(
      data.error?.message
        ? `Gemini request failed: ${data.error.message}`
        : `Gemini request failed with HTTP ${response.status}.`,
    );
  }

  const text = extractGeminiText(data);

  if (!text) {
    const reason =
      data.promptFeedback?.blockReason ||
      data.candidates?.find((candidate) => candidate.finishReason)
        ?.finishReason;

    throw new Error(
      reason
        ? `Gemini returned no text. Finish reason: ${reason}.`
        : "Gemini returned no text.",
    );
  }

  return text;
}
