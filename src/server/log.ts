/**
 * Structured JSON logs (one line per event) and error reporting. Never log tokens, secrets, document
 * contents or full emails: callers pass identifiers only, and `redact` masks common secret shapes anyway.
 */
type Level = "info" | "warn" | "error";

const SECRET = /(eyJ[\w-]+\.[\w-]+\.[\w-]+|sk-ant-[\w-]+|github_pat_\w+|Bearer\s+\S+)/g;
const redact = (s: string) => s.replace(SECRET, "[redacted]").replace(/([\w.+-])[\w.+-]*@([\w-]+\.[\w.-]+)/g, "$1***@$2");

export function log(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = redact(JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields }));
  if (level === "error") console.error(line); else if (level === "warn") console.warn(line); else console.info(line);
}

/**
 * Reports an error to the configured monitoring endpoint (AVSAR_ERROR_WEBHOOK_URL, e.g. a Sentry/Slack/
 * incident relay). Best-effort and bounded: monitoring trouble never affects the user's request.
 */
export async function reportError(err: unknown, context: Record<string, unknown> = {}, fetchImpl: typeof fetch = fetch) {
  const message = err instanceof Error ? err.message : String(err);
  log("error", "error", { message, ...context });
  const url = process.env.AVSAR_ERROR_WEBHOOK_URL;
  if (!url) return;
  await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: redact(JSON.stringify({ service: "avsar", env: process.env.AVSAR_ENV ?? process.env.NODE_ENV, message, stack: err instanceof Error ? err.stack?.split("\n").slice(0, 8).join("\n") : undefined, ...context })),
    signal: AbortSignal.timeout(3000),
  }).catch(() => undefined);
}
