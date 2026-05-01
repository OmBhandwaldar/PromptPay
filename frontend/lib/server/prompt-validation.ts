export type PromptBody = {
  prompt?: unknown;
};

export function validatePrompt(body: PromptBody) {
  if (typeof body.prompt !== "string") {
    return { ok: false as const, error: "Prompt is required." };
  }

  const prompt = body.prompt.trim();

  if (!prompt) {
    return { ok: false as const, error: "Prompt cannot be empty." };
  }

  if (prompt.length > 2000) {
    return {
      ok: false as const,
      error: "Prompt must be 2,000 characters or fewer.",
    };
  }

  return { ok: true as const, prompt };
}
