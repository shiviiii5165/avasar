import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { upsertIdentity } from "../auth/identity";
import { createMemoryDb, type Db } from "../db/client";
import { applications, opportunities } from "../db/schema";
import { createOpportunity, transitionOpportunity, type OpportunityInput } from "./opportunities";
import { listPartnerInternships, partnerQuery } from "./partner-opportunities";

/**
 * Partner API (GET /api/partner/v1/internships): authentication with AI Tathastu's signed service
 * assertion, visibility (published + open + internship + not sample), contract shape, pagination and
 * hand-off links. The real route handler runs against an in-memory database and a stubbed JWKS endpoint.
 */
const ISSUER = "https://www.aitathastu.com";
const JWKS_URL = "https://ait.test/api/integrations/jwks";
const ORIGIN = "https://avsar.test";
let db: Db;
let adminId: string;
let privateKey: CryptoKey;
let otherKey: CryptoKey;
let publicJwk: JWK;
const ids: Record<string, string> = {};

const base: OpportunityInput = {
  title: "Machine Learning Intern",
  category: "internship",
  organizationName: "Acme Robotics",
  description: "Work with the perception team on dataset tooling and model evaluation for warehouse robots.",
  workMode: "hybrid",
  locations: "Pune, Bengaluru",
  unpaid: false,
  compMin: 15000,
  compMax: 20000,
  compPeriod: "month",
  applicationMethod: "internal",
  requiredSkills: "Python, PyTorch",
  preferredSkills: "Docker",
  educationLevels: ["bachelors"],
  requiresWorkAuthorizationIndia: false,
  conversionPossible: false,
  stipendNote: "Plus travel allowance",
} as OpportunityInput;

async function make(key: string, over: Partial<OpportunityInput>, to: "published" | "draft" | "paused" | "closed" | "expired" | null = "published") {
  const o = await createOpportunity(db, { ...base, ...over } as OpportunityInput, adminId);
  if (to && to !== "draft") {
    // Avsar's own moderation path: review, approval, publication.
    await transitionOpportunity(db, o.id, "in_review", adminId);
    await transitionOpportunity(db, o.id, "approved", adminId);
    await transitionOpportunity(db, o.id, "published", adminId);
    if (to !== "published") await db.update(opportunities).set({ status: to }).where(eq(opportunities.id, o.id));
  }
  ids[key] = o.id;
  return o;
}

const assertion = (over: { aud?: string; scope?: string; sub?: string; ttl?: number; key?: CryptoKey; iss?: string; alg?: string } = {}) =>
  new SignJWT({ scope: over.scope ?? "opportunities:read" })
    .setProtectedHeader({ alg: over.alg ?? "ES256", kid: "ait-test", typ: "JWT" })
    .setIssuer(over.iss ?? ISSUER)
    .setAudience(over.aud ?? "avsar-partner-api")
    .setSubject(over.sub ?? "ai-tathastu")
    .setIssuedAt()
    .setExpirationTime(`${over.ttl ?? 120}s`)
    .setJti(crypto.randomUUID())
    .sign(over.key ?? privateKey);

let GET: (r: Request) => Promise<Response>;
const call = async (token?: string, qs = "") =>
  GET(new Request(`${ORIGIN}/api/partner/v1/internships${qs}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }));

beforeAll(async () => {
  db = await createMemoryDb();
  adminId = (await upsertIdentity(db, { provider: "dev", subject: "partner-admin", email: null, emailVerified: false, name: "Admin" })).id;
  const pair = await generateKeyPair("ES256", { extractable: true });
  privateKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: "ait-test", alg: "ES256", use: "sig" };
  otherKey = (await generateKeyPair("ES256")).privateKey;

  const future = new Date(Date.now() + 30 * 86_400_000);
  await make("open", { title: "Machine Learning Intern", deadline: future });
  await make("openNoDeadline", { title: "Data Engineering Intern", workMode: "remote", unpaid: true, compMin: undefined, compMax: undefined, compPeriod: undefined, stipendNote: undefined });
  await make("external", { title: "Frontend Intern", applicationMethod: "external", externalUrl: "https://careers.example.com/fe-intern" });
  await make("draft", { title: "Draft Intern" }, "draft");
  await make("paused", { title: "Paused Intern" }, "paused");
  await make("closed", { title: "Closed Intern" }, "closed");
  await make("expiredStatus", { title: "Expired Intern" }, "expired");
  await make("job", { title: "Backend Engineer", category: "job" });
  const pastDeadline = await make("pastDeadline", { title: "Past Deadline Intern", deadline: future });
  await db.update(opportunities).set({ deadline: new Date(Date.now() - 86_400_000) }).where(eq(opportunities.id, pastDeadline.id));
  const sample = await make("sample", { title: "Sample Intern" });
  await db.update(opportunities).set({ isSample: true }).where(eq(opportunities.id, sample.id));

  // The real route, with the in-memory database and a stubbed AI Tathastu JWKS endpoint.
  process.env.AVSAR_PARTNER_API_AIT = "1";
  process.env.AVSAR_AIT_JWKS_URL = JWKS_URL;
  process.env.AVSAR_PUBLIC_URL = ORIGIN;
  globalThis.__avsarDb = Promise.resolve(db);
  vi.stubGlobal("fetch", async (url: string) =>
    String(url) === JWKS_URL ? new Response(JSON.stringify({ keys: [publicJwk] }), { headers: { "content-type": "application/json" } }) : new Response("not found", { status: 404 }),
  );
  ({ GET } = await import("@/app/api/partner/v1/internships/route"));
});

afterAll(() => {
  vi.unstubAllGlobals();
  delete process.env.AVSAR_PARTNER_API_AIT;
});

describe("visibility: only published, open, real internships", () => {
  it("returns exactly the three open internships", async () => {
    const r = await listPartnerInternships(db, partnerQuery.parse({}), ORIGIN);
    expect(r.items.map((i) => i.title).sort()).toEqual(["Data Engineering Intern", "Frontend Intern", "Machine Learning Intern"]);
    expect(r.total).toBe(3);
    for (const hidden of ["draft", "paused", "closed", "expiredStatus", "pastDeadline", "sample", "job"]) {
      expect(r.items.some((i) => i.id === ids[hidden])).toBe(false);
    }
  });
});

describe("contract: actual fields, nothing internal", () => {
  it("maps skills, eligibility, stipend, dates and hand-off links", async () => {
    const r = await listPartnerInternships(db, partnerQuery.parse({}), ORIGIN);
    const ml = r.items.find((i) => i.id === ids.open)!;
    expect(ml).toMatchObject({
      organization: "Acme Robotics",
      requiredSkills: ["Python", "PyTorch"],
      preferredSkills: ["Docker"],
      locations: ["Pune", "Bengaluru"],
      workMode: "hybrid",
      status: "published",
      stipend: { min: 15000, max: 20000, currency: "INR", period: "month", note: "Plus travel allowance" },
      unpaid: false,
      applicationMethod: "internal",
    });
    expect(ml.eligibility?.educationLevels).toEqual(["bachelors"]);
    expect(ml.url).toBe(`${ORIGIN}/opportunities/${ml.slug}`);
    expect(ml.applyUrl).toBe(`${ORIGIN}/app/apply/${ml.slug}`);
    expect(ml.deadline).not.toBeNull();
    expect(ml.publishedAt).not.toBeNull();
    const keys = Object.keys(ml);
    for (const internal of ["questions", "createdBy", "orgId", "sourceId", "sourceProvider", "importedAt", "details", "version", "isSample"]) expect(keys).not.toContain(internal);
  });

  it("no deadline and no stipend are null, never invented; external listings apply via Avsar's detail page", async () => {
    const r = await listPartnerInternships(db, partnerQuery.parse({}), ORIGIN);
    const de = r.items.find((i) => i.id === ids.openNoDeadline)!;
    expect(de.deadline).toBeNull();
    expect(de.stipend).toBeNull();
    expect(de.unpaid).toBe(true);
    const fe = r.items.find((i) => i.id === ids.external)!;
    expect(fe.applyUrl).toBe(fe.url);
    expect(JSON.stringify(fe)).not.toContain("careers.example.com");
  });
});

describe("pagination", () => {
  it("pages are stable, disjoint and complete", async () => {
    const p1 = await listPartnerInternships(db, partnerQuery.parse({ pageSize: "2", page: "1" }), ORIGIN);
    const p2 = await listPartnerInternships(db, partnerQuery.parse({ pageSize: "2", page: "2" }), ORIGIN);
    expect(p1.hasMore).toBe(true);
    expect(p2.hasMore).toBe(false);
    const all = [...p1.items, ...p2.items].map((i) => i.id);
    expect(new Set(all).size).toBe(3);
    expect(partnerQuery.safeParse({ pageSize: "51" }).success).toBe(false);
  });
});

describe("route: authentication and authorisation", () => {
  it("accepts AI Tathastu's service assertion and returns the contract", async () => {
    const res = await call(await assertion());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.json();
    expect(body.schema).toBe("PartnerInternshipV1");
    expect(body.total).toBe(3);
  });

  it("rejects missing, forged, user sign-in, wrong-scope, wrong-issuer and long-lived tokens", async () => {
    expect((await call()).status).toBe(401);
    expect((await call(await assertion({ key: otherKey }))).status).toBe(401);
    // A student's sign-in token (aud = Avsar's client id, scope profile:read) is not a partner credential.
    expect((await call(await assertion({ aud: "avasar", scope: "profile:read", sub: "user-123" }))).status).toBe(401);
    expect((await call(await assertion({ scope: "opportunities:write" }))).status).toBe(401);
    expect((await call(await assertion({ sub: "collaborate" }))).status).toBe(401);
    expect((await call(await assertion({ iss: "https://evil.example" }))).status).toBe(401);
    expect((await call(await assertion({ ttl: 3600 }))).status).toBe(401);
  });

  it("rejects an invalid query and answers 503 when the partner API is switched off", async () => {
    expect((await call(await assertion(), "?pageSize=500")).status).toBe(400);
    process.env.AVSAR_PARTNER_API_AIT = "0";
    expect((await call(await assertion())).status).toBe(503);
    process.env.AVSAR_PARTNER_API_AIT = "1";
  });

  it("rate limits per partner", async () => {
    let last = 200;
    for (let i = 0; i < 125 && last !== 429; i++) last = (await call(await assertion())).status;
    expect(last).toBe(429);
  });

  it("listing internships never creates an application", async () => {
    expect((await db.select().from(applications)).length).toBe(0);
  });
});
