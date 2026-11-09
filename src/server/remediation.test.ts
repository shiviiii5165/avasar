import { describe, expect, it, vi } from "vitest";

import { checkDocx, documentText, DocumentTextError, PARSE_LIMITS } from "./ai/text";
import { createMemoryDb, type Db } from "./db/client";
import { can, type AdminRole } from "./domain/permissions";
import { criticalProblems, productionEnvProblems } from "./env-check";
import { checkRestoreTarget } from "./ops/restore-guard";
import { clientIp, clientIpUntrusted, rateLimit } from "./rate-limit";

const STAGING = "postgresql://u:p@ep-staging-1.example.neon.tech/avsar_staging?sslmode=require";
const PROD = "postgresql://u:p@ep-prod-1.example.neon.tech/neondb?sslmode=require";
const envOk = { AVSAR_ENV: "staging", AVSAR_RESTORE_ALLOWED_HOSTS: "ep-staging-1.example.neon.tech", AVSAR_PRODUCTION_DB_HOST: "ep-prod-1.example.neon.tech" };
const confirm = ["--confirm-host=ep-staging-1.example.neon.tech", "--confirm-database=avsar_staging"];

describe("A. restore guard", () => {
  it("approves an allow-listed staging target with exact typed confirmation", () => {
    expect(checkRestoreTarget({ databaseUrl: STAGING, env: envOk, argv: confirm })).toMatchObject({ ok: true, host: "ep-staging-1.example.neon.tech", database: "avsar_staging" });
  });
  it("refuses production by host, by AVSAR_ENV, and by NODE_ENV — even if allow-listed", () => {
    expect(checkRestoreTarget({ databaseUrl: PROD, env: { ...envOk, AVSAR_RESTORE_ALLOWED_HOSTS: "ep-prod-1.example.neon.tech" }, argv: ["--confirm-host=ep-prod-1.example.neon.tech", "--confirm-database=neondb"] }).ok).toBe(false);
    expect(checkRestoreTarget({ databaseUrl: STAGING, env: { ...envOk, AVSAR_ENV: "production" }, argv: confirm }).ok).toBe(false);
    expect(checkRestoreTarget({ databaseUrl: STAGING, env: { ...envOk, NODE_ENV: "production" }, argv: confirm }).ok).toBe(false);
  });
  it("refuses unknown, ambiguous and unconfirmed targets", () => {
    expect(checkRestoreTarget({ databaseUrl: "postgresql://u:p@other.example/db", env: envOk, argv: ["--confirm-host=other.example", "--confirm-database=db"] }).reason).toMatch(/not an approved/);
    expect(checkRestoreTarget({ databaseUrl: STAGING, env: { AVSAR_ENV: "staging" }, argv: confirm }).reason).toMatch(/ALLOWED_HOSTS is not set/);
    expect(checkRestoreTarget({ databaseUrl: STAGING, env: { ...envOk, AVSAR_ENV: undefined }, argv: confirm }).ok).toBe(false);
    expect(checkRestoreTarget({ databaseUrl: STAGING, env: envOk, argv: [] }).reason).toMatch(/Confirm the exact target/);
    expect(checkRestoreTarget({ databaseUrl: STAGING, env: envOk, argv: ["--confirm-host=ep-staging-1.example.neon.tech", "--confirm-database=wrong"] }).ok).toBe(false);
    expect(checkRestoreTarget({ databaseUrl: "postgresql://u:p@ep-staging-1.example.neon.tech/", env: envOk, argv: confirm }).ok).toBe(false);
    expect(checkRestoreTarget({ databaseUrl: undefined, env: envOk, argv: confirm }).ok).toBe(false);
  });
});

describe("B. trusted client IP", () => {
  const h = (v: Record<string, string>) => new Headers(v);
  it("production without trusted-proxy config never trusts client headers", () => {
    const env = { NODE_ENV: "production" };
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6" }), env)).toBe("untrusted");
    expect(clientIp(h({ "x-real-ip": "6.6.6.6" }), env)).toBe("untrusted");
    expect(clientIpUntrusted(env)).toBe(true);
  });
  it("with N trusted hops, a spoofed left-most entry is ignored", () => {
    const env = { NODE_ENV: "production", AVSAR_TRUSTED_PROXY_HOPS: "1" };
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }), env)).toBe("203.0.113.9"); // client wrote 6.6.6.6, proxy appended the real IP
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.9" }), env)).toBe("203.0.113.9");
    expect(clientIp(h({ "x-forwarded-for": "1.1.1.1, 203.0.113.9, 10.0.0.2" }), { ...env, AVSAR_TRUSTED_PROXY_HOPS: "2" })).toBe("203.0.113.9");
    expect(clientIp(h({}), env)).toBe("unknown");
  });
  it("a configured single-value header from the edge is used, and garbage is rejected", () => {
    const env = { NODE_ENV: "production", AVSAR_CLIENT_IP_HEADER: "x-real-ip" };
    expect(clientIp(h({ "x-real-ip": "2001:db8::1", "x-forwarded-for": "6.6.6.6" }), env)).toBe("2001:db8::1");
    expect(clientIp(h({ "x-real-ip": "<script>" }), env)).toBe("unknown");
    expect(clientIpUntrusted(env)).toBe(false);
  });
});

describe("C. production configuration", () => {
  it("missing database, public URL or signing secret is critical (server refuses to start)", () => {
    expect(criticalProblems({}).map((p) => p.name).sort()).toEqual(["AVSAR_PUBLIC_URL", "AVSAR_SIGNING_SECRET", "DATABASE_URL"]);
    expect(criticalProblems({ DATABASE_URL: "postgres://x", AVSAR_PUBLIC_URL: "http://plain", AVSAR_SIGNING_SECRET: "x".repeat(40) }).map((p) => p.name)).toEqual(["AVSAR_PUBLIC_URL"]);
  });
  it("reports names only, never values", () => {
    const text = JSON.stringify(productionEnvProblems({ AVSAR_AIT_CLIENT_SECRET: "super-secret-value", AVSAR_EMAIL_FROM: "bad" }));
    expect(text).not.toContain("super-secret-value");
    expect(text).toContain("AVSAR_EMAIL_FROM");
  });
});

describe("D. public support form limits", () => {
  it("allows a few submissions per IP, then refuses; a broken limiter fails closed for anonymous endpoints", async () => {
    const db: Db = await createMemoryDb();
    const now = new Date("2026-11-09T12:00:00Z");
    const r = [];
    for (let i = 0; i < 7; i++) r.push((await rateLimit(db, "supportIp", "ip:203.0.113.5", now, { failClosed: true })).ok);
    expect(r.filter(Boolean)).toHaveLength(5);
    const broken = { insert: () => { throw new Error("db down"); } } as unknown as Db;
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await rateLimit(broken, "supportIp", "ip:x", now, { failClosed: true })).ok).toBe(false);
    expect((await rateLimit(broken, "login", "ip:x", now)).ok).toBe(true); // signed-in flows still fail open
    spy.mockRestore();
  });
});

describe("E. document parsing limits", () => {
  it("rejects a zip bomb .docx before decompressing it", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>");
    zip.file("word/document.xml", "<w:document>" + "A".repeat(PARSE_LIMITS.docxMaxDocumentXml + 1024) + "</w:document>");
    const bomb = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
    expect(bomb.length).toBeLessThan(PARSE_LIMITS.maxBytes); // small on disk...
    await expect(checkDocx(bomb)).rejects.toBeInstanceOf(DocumentTextError); // ...refused by declared size
  });
  it("rejects too many entries, damaged zips, a missing document part, oversize input and unknown types", async () => {
    const { default: JSZip } = await import("jszip");
    const many = new JSZip();
    for (let i = 0; i <= PARSE_LIMITS.docxMaxEntries; i++) many.file(`x/${i}.xml`, "<a/>");
    many.file("word/document.xml", "<w:document/>");
    await expect(checkDocx(await many.generateAsync({ type: "nodebuffer" }))).rejects.toThrow(/too many parts/);
    await expect(checkDocx(Buffer.from("PK\u0003\u0004 not really a zip"))).rejects.toThrow(/damaged/);
    const empty = new JSZip(); empty.file("other.xml", "<a/>");
    await expect(checkDocx(await empty.generateAsync({ type: "nodebuffer" }))).rejects.toThrow(/no document content/);
    await expect(documentText(Buffer.alloc(PARSE_LIMITS.maxBytes + 1), "application/pdf")).rejects.toThrow(/4 MB/);
    await expect(documentText(Buffer.from("x"), "text/html")).rejects.toThrow(/Only PDF and Word/);
  });
  it("rejects a malformed PDF without crashing", async () => {
    await expect(documentText(Buffer.from("%PDF-1.4\n garbage without objects"), "application/pdf")).rejects.toBeTruthy();
  });
});

describe("F. staff document permissions (least privilege)", () => {
  const roles: AdminRole[] = ["super_admin", "platform_admin", "verification_officer", "moderator", "support_agent", "analytics_admin"];
  it("only Super Admin can open any candidate's documents; Support keeps the directory only", () => {
    expect(roles.filter((r) => can([r], "document.view_any"))).toEqual(["super_admin"]);
    expect(can(["support_agent"], "candidate.view")).toBe(true);
    expect(can(["support_agent"], "document.view_any")).toBe(false);
  });
});

import { canonicalRedirect } from "../proxy";

describe("canonical host (avasar.aitathastu.com)", () => {
  const pub = "https://avasar.aitathastu.com";
  it("redirects the Vercel host to the canonical domain, keeping path and query", () => {
    expect(canonicalRedirect("https://avasar-orcin.vercel.app/opportunities?q=react", "avasar-orcin.vercel.app", pub)).toBe("https://avasar.aitathastu.com/opportunities?q=react");
    expect(canonicalRedirect("https://avasar-orcin.vercel.app/api/auth/login?returnTo=%2Fapp", "avasar-orcin.vercel.app", pub)).toBe("https://avasar.aitathastu.com/api/auth/login?returnTo=%2Fapp");
  });
  it("leaves the canonical host and health checks alone, and does nothing without a valid public URL", () => {
    expect(canonicalRedirect("https://avasar.aitathastu.com/app", "avasar.aitathastu.com", pub)).toBeNull();
    expect(canonicalRedirect("https://avasar.aitathastu.com/app", "AVASAR.AITATHASTU.COM", pub)).toBeNull();
    expect(canonicalRedirect("https://avasar-orcin.vercel.app/api/health", "avasar-orcin.vercel.app", pub)).toBeNull();
    expect(canonicalRedirect("https://avasar-orcin.vercel.app/api/health/live", "avasar-orcin.vercel.app", pub)).toBeNull();
    expect(canonicalRedirect("https://x.vercel.app/", "x.vercel.app", undefined)).toBeNull();
    expect(canonicalRedirect("https://x.vercel.app/", "x.vercel.app", "not a url")).toBeNull();
  });
});
