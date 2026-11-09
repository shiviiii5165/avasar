import "server-only";

import { ground } from "./grounding";
import { rulesProvider } from "./rules";
import type { AiProvider, ResumeExtraction } from "./types";

/** The configured provider. Defaults to the offline rules engine; Claude only when explicitly configured. */
export async function aiProvider(): Promise<AiProvider> {
  if (process.env.AVSAR_AI_PROVIDER === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    const { anthropicProvider } = await import("./anthropic");
    return anthropicProvider(process.env.ANTHROPIC_API_KEY);
  }
  return rulesProvider;
}

export function aiStatus() {
  const wanted = process.env.AVSAR_AI_PROVIDER === "anthropic";
  return { provider: wanted && process.env.ANTHROPIC_API_KEY ? "anthropic" : "rules", misconfigured: wanted && !process.env.ANTHROPIC_API_KEY };
}

/**
 * Extract → ground. If the configured provider fails, fall back to the rules engine, so AI trouble never
 * blocks anything. `provider` reports what actually produced the result.
 */
export async function extractResumeSafely(text: string, provider?: AiProvider): Promise<{ result: ResumeExtraction; rejected: number; provider: string; fellBack: boolean }> {
  const p = provider ?? (await aiProvider());
  try {
    const { kept, rejected } = ground(await p.extractResume(text), text);
    return { result: kept, rejected, provider: p.name, fellBack: false };
  } catch (err) {
    if (p.name === "rules") throw err;
    console.error("[ai] provider failed, using rules:", err instanceof Error ? err.message : err);
    const { kept, rejected } = ground(await rulesProvider.extractResume(text), text);
    return { result: kept, rejected, provider: "rules", fellBack: true };
  }
}
