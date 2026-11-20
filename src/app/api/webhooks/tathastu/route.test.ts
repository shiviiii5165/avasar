import { createHmac, randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryDb, type Db } from "@/server/db/client";

/** The real route handler on PGlite: raw-body signature check, JSON parsing, 503 when unconfigured, outcome. */
let db: Db;
vi.mock("@/server/db/client", async (orig) => ({ ...(await orig<typeof import("@/server/db/client")>()), getDb: async () => db }));

const { POST } = await import("./route");
const SECRET = "route-test-secret";

const projection = (sub: string) => ({
  schema: "ProfessionalProjectionV1", version: 1, audience: "avasar", generatedAt: new Date().toISOString(),
  identity: { id: sub, email: `${sub}@example.invalid`, name: "Route Person" },
  education: null, skills: null, projects: null, experience: null, achievements: null,
  privacy: { scopes: {}, masked: ["education", "skills", "projects", "experience", "achievements"] },
});
function request(body: unknown, { secret = SECRET, t = Math.floor(Date.now() / 1000), raw }: { secret?: string; t?: number; raw?: string } = {}) {
  const text = raw ?? JSON.stringify(body);
  const sig = `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${text}`).digest("hex")}`;
  const id = (body as { id?: string })?.id;
  return new Request("https://avsar.example.test/api/webhooks/tathastu", {
    method: "POST",
    headers: { "content-type": "application/json", "x-ait-signature": sig, ...(id ? { "x-ait-delivery": id } : {}), "x-forwarded-for": "203.0.113.7" },
    body: text,
  });
}
const event = (sub: string) => ({ id: randomUUID(), type: "profile.updated", createdAt: new Date().toISOString(), data: { userId: sub, reason: "auto_provision", profile: projection(sub) } });

beforeAll(async () => {
  db = await createMemoryDb();
});
beforeEach(() => {
  process.env.AVSAR_AIT_WEBHOOK_SECRET = SECRET;
  process.env.AVSAR_AIT_CLIENT_ID = "avasar";
});

describe("POST /api/webhooks/tathastu", () => {
  it("is off (503, retryable) until the secret is configured", async () => {
    delete process.env.AVSAR_AIT_WEBHOOK_SECRET;
    const res = await POST(request(event("r-off")));
    expect(res.status).toBe(503);
    expect((await res.json()).outcome).toBe("retryable");
  });

  it("a correctly signed auto_provision answers 200 with outcome created", async () => {
    const res = await POST(request(event("r-ok")));
    expect(res.status).toBe(200);
    expect((await res.json()).result).toMatchObject({ outcome: "created", action: "AUTO_PROVISIONED_PRIVATE" });
  });

  it("rejects a bad signature, a stale signature and a tampered body with 401 before parsing", async () => {
    expect((await POST(request(event("r-bad"), { secret: "wrong" }))).status).toBe(401);
    expect((await POST(request(event("r-old"), { t: Math.floor(Date.now() / 1000) - 3600 }))).status).toBe(401);
    const e = event("r-tamper");
    const signed = request(e);
    const tampered = new Request(signed.url, { method: "POST", headers: signed.headers, body: JSON.stringify({ ...e, data: { ...e.data, userId: "someone-else" } }) });
    expect((await POST(tampered)).status).toBe(401);
  });

  it("a signed but malformed body is 400 rejected", async () => {
    const res = await POST(request(null, { raw: "{not json" }));
    expect(res.status).toBe(400);
    expect((await res.json()).outcome).toBe("rejected");
  });
});
