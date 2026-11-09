import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Email delivery adapter.
 *  - Production: an HTTPS provider endpoint configured by the owner (AVSAR_EMAIL_WEBHOOK_URL + token, e.g. a
 *    Resend/Postmark/SES relay on a verified sending domain). Missing configuration throws, so jobs retry
 *    and dead-letter visibly instead of silently dropping mail.
 *  - Development and tests: a local sink that writes each message to .data/outbox/*.json. Nothing is sent.
 */
export interface EmailMessage { to: string; subject: string; text: string }
export type EmailResult = { delivered: "provider"; id: string | null } | { delivered: "sink"; file: string };

export const OUTBOX = path.join(process.cwd(), ".data/outbox");

export function emailMode(): "provider" | "sink" | "unconfigured" {
  if (process.env.AVSAR_EMAIL_WEBHOOK_URL) return "provider";
  return process.env.NODE_ENV === "production" ? "unconfigured" : "sink";
}

export async function sendEmail(msg: EmailMessage, fetchImpl: typeof fetch = fetch): Promise<EmailResult> {
  const mode = emailMode();
  if (mode === "unconfigured") throw new Error("Email provider not configured (AVSAR_EMAIL_WEBHOOK_URL)");
  if (mode === "sink") {
    await mkdir(OUTBOX, { recursive: true });
    const file = path.join(OUTBOX, `${Date.now()}-${msg.subject.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.json`);
    await writeFile(file, JSON.stringify({ ...msg, at: new Date().toISOString(), note: "Development sink: not sent." }, null, 2));
    return { delivered: "sink", file };
  }
  const res = await fetchImpl(process.env.AVSAR_EMAIL_WEBHOOK_URL!, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.AVSAR_EMAIL_WEBHOOK_TOKEN ?? ""}` },
    body: JSON.stringify({ ...msg, from: process.env.AVSAR_EMAIL_FROM ?? "Avsar <no-reply@avsar.invalid>" }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 422 || res.status === 400) throw Object.assign(new Error(`email rejected by provider (${res.status})`), { permanent: true });
  if (!res.ok) throw new Error(`email provider returned ${res.status}`); // retried with backoff by the job runner
  const body = (await res.json().catch(() => null)) as { id?: string } | null;
  return { delivered: "provider", id: body?.id ?? null };
}
