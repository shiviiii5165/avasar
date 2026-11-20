import { NextResponse } from "next/server";

import { getDb } from "@/server/db/client";
import { log } from "@/server/log";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { processWebhook, verifySignature } from "@/server/services/ait-webhooks";

/**
 * POST /api/webhooks/tathastu: AI Tathastu's signed profile events (see src/server/services/ait-webhooks.ts).
 * Off until AVSAR_AIT_WEBHOOK_SECRET is set (503, so AI Tathastu keeps retrying rather than dropping events).
 * The signature is checked over the exact raw bytes before anything is parsed or stored.
 */
export async function POST(request: Request) {
  const secret = process.env.AVSAR_AIT_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ outcome: "retryable", action: "NOT_CONFIGURED" }, { status: 503 });

  const db = await getDb();
  if (!(await rateLimit(db, "webhook", `ip:${clientIp(request.headers)}`)).ok) {
    return NextResponse.json({ outcome: "retryable", action: "RATE_LIMITED" }, { status: 429 });
  }

  const raw = await request.text();
  const sig = verifySignature(raw, request.headers.get("x-ait-signature"), secret);
  if (!sig.ok) {
    log("warn", "ait_webhook.rejected_signature", { reason: sig.error });
    return NextResponse.json({ outcome: "rejected", action: "INVALID_SIGNATURE" }, { status: 401 });
  }
  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ outcome: "rejected", action: "INVALID_JSON" }, { status: 400 });
  }
  const result = await processWebhook(
    db,
    event as Parameters<typeof processWebhook>[1],
    { delivery: request.headers.get("x-ait-delivery"), event: request.headers.get("x-ait-event") },
    process.env.AVSAR_AIT_CLIENT_ID?.trim() || "avasar",
  );
  return NextResponse.json({ success: result.status === 200, result }, { status: result.status });
}
