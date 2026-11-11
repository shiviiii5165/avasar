import { NextResponse } from "next/server";

import { publicUrl } from "@/server/config";
import { getDb } from "@/server/db/client";
import { apiError } from "@/server/http";
import { partnerConfig, verifyPartnerRequest } from "@/server/integrations/partner-auth";
import { rateLimit } from "@/server/rate-limit";
import { listPartnerInternships, partnerQuery } from "@/server/services/partner-opportunities";

/**
 * GET /api/partner/v1/internships?page=&pageSize=&workMode=
 *
 * Published, open internships for AI Tathastu's dashboard (contract PartnerInternshipV1, see
 * docs/API_CONTRACT.md). Authenticated with AI Tathastu's signed service assertion (partner-auth.ts),
 * rate limited per partner, never cached by intermediaries. Applications are not possible through this
 * API: each item links to Avsar's own listing and apply pages.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cfg = partnerConfig();
  if (!cfg) return apiError(503, "PARTNER_API_DISABLED", "The partner API is not enabled");

  const auth = await verifyPartnerRequest(request, cfg);
  if (!auth.ok) {
    return auth.status === 503
      ? apiError(503, "KEYS_UNAVAILABLE", "Partner keys could not be verified right now; retry later")
      : apiError(401, "UNAUTHORIZED", "A valid partner assertion is required");
  }

  const parsed = partnerQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError(400, "INVALID_QUERY", "page, pageSize (max 50) or workMode is invalid");

  const db = await getDb();
  const rl = await rateLimit(db, "partnerApi", auth.partner, new Date(), { failClosed: true });
  if (!rl.ok) {
    const res = apiError(429, "RATE_LIMITED", "Too many partner requests");
    res.headers.set("retry-after", String(rl.retryAfterSec));
    return res;
  }

  const body = await listPartnerInternships(db, parsed.data, publicUrl());
  return NextResponse.json(body, { headers: { "cache-control": "private, no-store" } });
}
