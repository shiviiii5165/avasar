import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({}));
const { candidateDomains } = await import("./logos");

describe("candidateDomains", () => {
  it("prefers the organization's own domain, reduced to its registrable part", () => {
    expect(candidateDomains("Rubrik", ["https://careers.rubrik.com/jobs"], [])[0]).toBe("rubrik.com");
    expect(candidateDomains("TCS", ["www.tcs.co.in"], [])[0]).toBe("tcs.co.in");
  });

  it("never uses job boards or applicant-tracking hosts", () => {
    const d = candidateDomains("Acme Robotics", [], ["https://boards.greenhouse.io/acme", "https://www.linkedin.com/jobs/1", "https://internshala.com/x"]);
    expect(d.some((x) => /greenhouse|linkedin|internshala/.test(x))).toBe(false);
  });

  it("ignores an apply link whose domain doesn't look like the company", () => {
    expect(candidateDomains("Zeta", [], ["https://some-agency.com/apply"])).not.toContain("some-agency.com");
  });

  it("guesses only from the exact company name, with legal suffixes removed", () => {
    expect(candidateDomains("Razorpay Software Pvt Ltd", [], [])).toContain("razorpaysoftware.com");
    expect(candidateDomains("Freshworks Inc.", [], [])[0]).toBe("freshworks.com");
  });

  it("rejects anything that isn't a plain public hostname (no SSRF vectors)", () => {
    const d = candidateDomains("x", ["http://127.0.0.1", "http://[::1]/", "javascript:alert(1)", "http://localhost:3000", "file:///etc/passwd", "https://169.254.169.254/latest"], ["http://user:pw@evil.com@10.0.0.1"]);
    expect(d).toEqual([]);
  });

  it("caps the number of lookups", () => {
    expect(candidateDomains("Alpha Beta Gamma", ["alpha.com", "beta.com", "gamma.com"], []).length).toBeLessThanOrEqual(8);
  });
});

describe("isWebUrl (apply and source links)", async () => {
  const { isWebUrl } = await import("./opportunities");
  it("accepts only absolute http(s) links", () => {
    expect(isWebUrl("https://careers.example.com/jobs/1")).toBe(true);
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>", "file:///etc/passwd", "/relative", "https://user:pw@example.com", "https://localhost", ""]) expect(isWebUrl(bad)).toBe(false);
  });
});

describe("listing text for story slides", async () => {
  const { splitSections, decodeEntities } = await import("@/components/opportunity/listing-text");
  it("splits at headings, drops job codes and empty sections, and decodes entities", () => {
    const s = splitSections("GAQ126R44\nAbout Acme\nAcme builds AI &amp; data tools.\nWhat You'll Do\n- Build things\nTesting: write tests");
    expect(s.map((x) => x.title)).toEqual(["About Acme", "What You'll Do"]);
    expect(s[0].lines).toEqual(["Acme builds AI & data tools."]);
    expect(decodeEntities("AT&amp;amp;T")).toBe("AT&T");
  });
  it("caps the number of slides, folding the rest into the last", () => {
    const text = Array.from({ length: 8 }, (_, i) => `Heading ${i}\nBody ${i}.`).join("\n");
    expect(splitSections(text, 5)).toHaveLength(5);
  });
});
