import { describe, it, expect } from "vitest";
import { safeEqual, matchesSecret, isAuthorizedCron } from "./secrets";

const req = (auth?: string) =>
  new Request("http://localhost/x", auth ? { headers: { authorization: auth } } : undefined);

describe("safeEqual", () => {
  it("matches equal strings and rejects different or different-length ones", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });

  it("is true only for identical strings (bearer, empty and length-mismatch cases)", () => {
    expect(safeEqual("Bearer abc", "Bearer abc")).toBe(true);
    expect(safeEqual("Bearer abc", "Bearer abd")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
    expect(safeEqual("short", "a much longer secret value")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("matchesSecret — fails closed", () => {
  it("refuses everything when the secret is unset or empty", () => {
    expect(matchesSecret("", undefined)).toBe(false);
    expect(matchesSecret(undefined, undefined)).toBe(false);
    expect(matchesSecret("", "")).toBe(false);
  });
  it("accepts only the exact string", () => {
    expect(matchesSecret("k1", "k1")).toBe(true);
    expect(matchesSecret("k2", "k1")).toBe(false);
    expect(matchesSecret(123, "123")).toBe(false);
    expect(matchesSecret(undefined, "k1")).toBe(false);
  });
});

describe("isAuthorizedCron", () => {
  it("refuses when CRON_SECRET is unset, even with an empty bearer", () => {
    expect(isAuthorizedCron(req("Bearer "), undefined)).toBe(false);
    expect(isAuthorizedCron(req("Bearer "), "")).toBe(false);
  });
  it("accepts only the exact bearer header", () => {
    expect(isAuthorizedCron(req("Bearer s3"), "s3")).toBe(true);
    expect(isAuthorizedCron(req("Bearer s4"), "s3")).toBe(false);
    expect(isAuthorizedCron(req("s3"), "s3")).toBe(false);
    expect(isAuthorizedCron(req(), "s3")).toBe(false);
  });
});
