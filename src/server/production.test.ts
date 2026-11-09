import { readFile, rm } from "node:fs/promises";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createMemoryDb, type Db } from "./db/client";
import { emailMode, OUTBOX, sendEmail } from "./email";
import { productionEnvProblems } from "./env-check";
import { log, reportError } from "./log";
import { clientIp, LIMITS, rateLimit } from "./rate-limit";
import { s3Storage } from "./storage";

describe("rate limiting (database-backed, shared across instances)", () => {
  let db: Db;
  beforeAll(async () => { db = await createMemoryDb(); });
  it("allows up to the limit in a window, then refuses with a retry time", async () => {
    const now = new Date("2026-11-09T10:00:05Z");
    const results = [];
    for (let i = 0; i < LIMITS.login.limit + 2; i++) results.push(await rateLimit(db, "login", "ip:9.9.9.9", now));
    expect(results.filter((r) => r.ok)).toHaveLength(LIMITS.login.limit);
    expect(results.at(-1)).toMatchObject({ ok: false, remaining: 0 });
    expect(results.at(-1)!.retryAfterSec).toBe(55);
  });
  it("keys are independent and windows reset", async () => {
    const now = new Date("2026-11-09T10:00:05Z");
    expect((await rateLimit(db, "login", "ip:1.1.1.1", now)).ok).toBe(true);
    expect((await rateLimit(db, "login", "ip:9.9.9.9", new Date("2026-11-09T10:01:01Z"))).ok).toBe(true);
  });
  it("uses the first forwarded hop as the client IP", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("email adapter", () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  it("development writes to a local sink and sends nothing", async () => {
    vi.stubEnv("AVSAR_EMAIL_WEBHOOK_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(emailMode()).toBe("sink");
    const res = await sendEmail({ to: "student@example.invalid", subject: "Test invite", text: "hello" });
    expect(res.delivered).toBe("sink");
    if (res.delivered === "sink") {
      expect(JSON.parse(await readFile(res.file, "utf8"))).toMatchObject({ to: "student@example.invalid", note: expect.stringMatching(/not sent/) });
      await rm(res.file);
    }
    expect(OUTBOX).toMatch(/outbox$/);
  });
  it("production without a provider refuses (so jobs retry visibly) instead of dropping mail", async () => {
    vi.stubEnv("AVSAR_EMAIL_WEBHOOK_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    await expect(sendEmail({ to: "a@b.c", subject: "x", text: "y" })).rejects.toThrow(/not configured/);
  });
  it("provider failures are retryable; rejections are permanent", async () => {
    vi.stubEnv("AVSAR_EMAIL_WEBHOOK_URL", "https://mail.example.invalid/send");
    await expect(sendEmail({ to: "a@b.c", subject: "x", text: "y" }, async () => new Response("", { status: 503 }))).rejects.not.toHaveProperty("permanent");
    await expect(sendEmail({ to: "a@b.c", subject: "x", text: "y" }, async () => new Response("", { status: 422 }))).rejects.toHaveProperty("permanent", true);
    expect(await sendEmail({ to: "a@b.c", subject: "x", text: "y" }, async () => Response.json({ id: "m_1" }))).toEqual({ delivered: "provider", id: "m_1" });
  });
});

describe("S3-compatible storage adapter", () => {
  it("writes private, encrypted objects under documents/ and reads them back", async () => {
    const sent: { name: string; input: Record<string, unknown> }[] = [];
    const store = new Map<string, Uint8Array>();
    const client = {
      send: async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
        sent.push({ name: cmd.constructor.name, input: cmd.input });
        const key = String(cmd.input.Key);
        if (cmd.constructor.name === "PutObjectCommand") store.set(key, cmd.input.Body as Uint8Array);
        if (cmd.constructor.name === "GetObjectCommand") return { Body: { transformToByteArray: async () => store.get(key)! } };
        if (cmd.constructor.name === "DeleteObjectCommand") store.delete(key);
        return {};
      },
    };
    const s = s3Storage({ bucket: "avsar-docs", region: "ap-south-1" }, client as never);
    await s.put("abc.pdf", Buffer.from("%PDF"), "application/pdf");
    expect(sent[0]).toMatchObject({ name: "PutObjectCommand", input: { Bucket: "avsar-docs", Key: "documents/abc.pdf", ServerSideEncryption: "AES256", IfNoneMatch: "*" } });
    expect((await s.get("abc.pdf")).toString()).toBe("%PDF");
    await s.remove("abc.pdf");
    expect(store.size).toBe(0);
    await expect(s.put("../escape", Buffer.from("x"), "text/plain")).rejects.toThrow(/Invalid storage key/);
  });
});

describe("production environment validation", () => {
  it("lists missing settings by name only", () => {
    const names = productionEnvProblems({}).map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(["DATABASE_URL", "AVSAR_SIGNING_SECRET", "AVSAR_AIT_CLIENT_SECRET", "AVSAR_STORAGE_DRIVER", "AVSAR_EMAIL_WEBHOOK_URL"]));
  });
  it("passes a complete configuration and flags unsafe ones", () => {
    const ok = { DATABASE_URL: "postgres://x", AVSAR_PUBLIC_URL: "https://avsar.example", AVSAR_SIGNING_SECRET: "x".repeat(40), AVSAR_AIT_BASE_URL: "https://www.aitathastu.com", AVSAR_AIT_CLIENT_ID: "avsar", AVSAR_AIT_CLIENT_SECRET: "s", AVSAR_STORAGE_DRIVER: "s3", AVSAR_S3_BUCKET: "b", AVSAR_S3_REGION: "ap-south-1", AVSAR_EMAIL_WEBHOOK_URL: "https://m" };
    expect(productionEnvProblems(ok)).toEqual([]);
    expect(productionEnvProblems({ ...ok, AVSAR_DEV_AUTH: "1", AVSAR_PUBLIC_URL: "http://x" }).map((p) => p.name)).toEqual(["AVSAR_DEV_AUTH", "AVSAR_PUBLIC_URL"]);
  });
});

describe("logging never leaks secrets", () => {
  it("redacts tokens and masks emails in logs and error reports", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    log("info", "test", { auth: "Bearer abc.def.ghi", email: "meera@example.com", jwt: "eyJhbGciOi.eyJzdWIiOi.c2ln" });
    const line = spy.mock.calls[0][0] as string;
    expect(line).not.toMatch(/abc\.def|eyJhbGciOi|meera@/);
    spy.mockRestore();
    vi.stubEnv("AVSAR_ERROR_WEBHOOK_URL", "https://errors.example.invalid");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let body = "";
    await reportError(new Error("token sk-ant-api03-SECRET leaked"), {}, async (_u, init) => { body = String(init?.body); return new Response(""); });
    expect(body).toContain("[redacted]");
    expect(body).not.toContain("SECRET");
    errSpy.mockRestore();
    vi.unstubAllEnvs();
  });
});

describe("rate limiter fails open", () => {
  it("allows the request (and reports) when its storage errors", async () => {
    const broken = { insert: () => { throw new Error("relation rate_limits does not exist"); } } as unknown as Db;
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await rateLimit(broken, "login", "ip:x")).ok).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
