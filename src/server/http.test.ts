import { describe, expect, it } from "vitest";

import { secretMatches } from "./http";

describe("secretMatches (health token and other shared secrets)", () => {
  it("matches only the exact secret", () => {
    expect(secretMatches("s3cret-token", "s3cret-token")).toBe(true);
    expect(secretMatches("s3cret-tokeN", "s3cret-token")).toBe(false);
    expect(secretMatches("short", "s3cret-token")).toBe(false);
  });

  it("is false for missing values (an unset token never authorizes)", () => {
    expect(secretMatches("", "x")).toBe(false);
    expect(secretMatches("x", undefined)).toBe(false);
    expect(secretMatches(null, "")).toBe(false);
  });

  it("returns false, never throws, for non-ASCII input of the same character length", () => {
    const token = "abcdefghijkl";
    const given = "é".repeat(token.length); // equal string length, twice the UTF-8 length
    expect(() => secretMatches(given, token)).not.toThrow();
    expect(secretMatches(given, token)).toBe(false);
  });
});
