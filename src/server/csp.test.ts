import { describe, expect, it } from "vitest";

import { newNonce, strictCsp } from "./csp";

describe("strict CSP", () => {
  it("uses a fresh nonce, no unsafe-inline scripts, and locks framing, base and objects", () => {
    const a = newNonce();
    expect(a).not.toBe(newNonce());
    const csp = strictCsp(a, { dev: false, formAction: "https://www.aitathastu.com" });
    const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).toBe(`script-src 'self' 'nonce-${a}' 'strict-dynamic'`);
    expect(script).not.toContain("unsafe");
    for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self' https://www.aitathastu.com"]) expect(csp).toContain(d);
  });

  it("refuses header-injection values", () => {
    expect(() => strictCsp("abc'; script-src *", { dev: false })).toThrow();
    expect(strictCsp(newNonce(), { dev: false, formAction: "https://x.test; script-src *" })).toContain("form-action 'self';");
  });
});

describe("CSP rollout mode", () => {
  it("enforces on previews, stays report-only in production by default, and an explicit setting wins", async () => {
    const { cspMode } = await import("./csp");
    expect(cspMode({ VERCEL_ENV: "preview" })).toBe("enforce");
    expect(cspMode({ VERCEL_ENV: "production" })).toBe("report-only");
    expect(cspMode({})).toBe("report-only");
    expect(cspMode({ VERCEL_ENV: "production", AVSAR_CSP_MODE: "enforce" })).toBe("enforce");
    expect(cspMode({ VERCEL_ENV: "preview", AVSAR_CSP_MODE: "report-only" })).toBe("report-only");
    expect(cspMode({ AVSAR_CSP_MODE: "bogus" })).toBe("report-only");
  });
});
