import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { createMemoryDb } from "../db/client";
import { RETURN_PATH_HEADER } from "./return-path";
import { safeReturnTo } from "./tathastu";

/**
 * Apply return path: a signed-out visitor opening /app/apply/<slug> must be sent to sign-in with that
 * exact path, and come back to it afterwards; nothing else may become a redirect target.
 */
let sessionToken: string | undefined;
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "avsar_session" && sessionToken ? { value: sessionToken } : undefined) }),
}));

beforeAll(async () => {
  globalThis.__avsarDb = Promise.resolve(await createMemoryDb());
});

describe("proxy records the requested path", () => {
  it("passes /app/apply/<slug>?q to the page as a request header", async () => {
    const { proxy } = await import("@/proxy");
    const res = proxy(new NextRequest("http://127.0.0.1:3000/app/apply/ml-intern-acme?ref=ait"));
    expect(res.headers.get(`x-middleware-request-${RETURN_PATH_HEADER}`)).toBe("/app/apply/ml-intern-acme?ref=ait");
  });

  it("overwrites a value the client tried to send", async () => {
    const { proxy } = await import("@/proxy");
    const res = proxy(new NextRequest("http://127.0.0.1:3000/app/discover", { headers: { [RETURN_PATH_HEADER]: "https://evil.example/phish" } }));
    expect(res.headers.get(`x-middleware-request-${RETURN_PATH_HEADER}`)).toBe("/app/discover");
  });
});

describe("signed-out Apply goes to sign-in with the exact return path", () => {
  it("requireUser redirects to /sign-in?returnTo=/app/apply/<slug>", async () => {
    sessionToken = undefined;
    const { requireUser } = await import("./session");
    await expect(requireUser(safeReturnTo("/app/apply/ml-intern-acme"))).rejects.toThrow("REDIRECT:/sign-in?returnTo=%2Fapp%2Fapply%2Fml-intern-acme");
  });

  it("an already signed-in student is not redirected (the apply page renders as before)", async () => {
    const db = await globalThis.__avsarDb!;
    const { upsertIdentity, createSession } = await import("./identity");
    const id = await upsertIdentity(db, { provider: "dev", subject: "rp-student", email: null, emailVerified: true, name: "RP Student" });
    sessionToken = (await createSession(db, id.id)).token;
    const { requireUser } = await import("./session");
    const s = await requireUser(safeReturnTo("/app/apply/ml-intern-acme"));
    expect(s.identity.id).toBe(id.id);
  });

  it("after sign-in the student returns to the same application page", () => {
    // The sign-in page, /api/auth/login, the AI Tathastu callback and the dev route all pass returnTo through safeReturnTo.
    expect(safeReturnTo("/app/apply/ml-intern-acme")).toBe("/app/apply/ml-intern-acme");
    expect(safeReturnTo("/app/apply/ml-intern-acme?ref=ait")).toBe("/app/apply/ml-intern-acme?ref=ait");
  });
});

describe("only safe internal paths are accepted", () => {
  it.each([
    ["external URL", "https://evil.example/apply"],
    ["protocol-relative", "//evil.example/apply"],
    ["backslash trick", "/\\evil.example"],
    ["javascript scheme", "javascript:alert(1)"],
    ["no leading slash", "app/apply/x"],
    ["control characters", "/app\r\nLocation: https://evil.example"],
    ["empty", ""],
    ["missing", null],
  ])("%s falls back to /app", (_label, value) => {
    expect(safeReturnTo(value as string | null)).toBe("/app");
  });

  it("encoded slashes stay a same-origin path (never a host)", () => {
    const out = safeReturnTo("/%2F%2Fevil.example");
    expect(out.startsWith("/") && !out.startsWith("//")).toBe(true);
    expect(new URL(out, "https://avsar.example").origin).toBe("https://avsar.example");
  });
});
