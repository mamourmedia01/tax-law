import { config } from "./lib.js";

// ---------------------------------------------------------------------------
// Anthropic LLM client (REST over fetch, no SDK dependency).
//
// Used by the grounded assistants (concierge / copilot / voice) to phrase replies.
// It is *only* ever given facts the caller already derived from the database — it
// rephrases, it never sources facts (grounded, I24; suggest-never-act, I25). When
// no ANTHROPIC_API_KEY is set, or the call fails/times out, it returns null so the
// caller uses its deterministic fallback (graceful, I29).
// ---------------------------------------------------------------------------

export function llmEnabled(): boolean {
  return Boolean(config.anthropicKey);
}

export async function llmText(args: {
  system: string;
  user: string;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<string | null> {
  if (!config.anthropicKey) return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), args.timeoutMs ?? 8000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": config.anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.anthropicModel,
        max_tokens: args.maxTokens ?? 400,
        system: args.system,
        messages: [{ role: "user", content: args.user }],
      }),
      signal: ac.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content ?? [])
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text)
      .join("")
      .trim();
    return text || null;
  } catch {
    return null; // network error / timeout / abort → graceful fallback
  } finally {
    clearTimeout(timer);
  }
}
