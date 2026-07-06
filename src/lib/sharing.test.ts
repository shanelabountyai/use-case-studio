import { describe, it, expect } from "vitest";
import { generateShareToken, shareUrl } from "./sharing";

describe("generateShareToken", () => {
  it("is at least 24 chars and URL-safe", () => {
    const t = generateShareToken();
    expect(t.length).toBeGreaterThanOrEqual(24);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is unique across many calls (crypto-random)", () => {
    const set = new Set(Array.from({ length: 1000 }, () => generateShareToken()));
    expect(set.size).toBe(1000);
  });
});

describe("shareUrl", () => {
  it("joins origin and token without a double slash", () => {
    expect(shareUrl("https://x.app", "tok")).toBe("https://x.app/s/tok");
    expect(shareUrl("https://x.app/", "tok")).toBe("https://x.app/s/tok");
  });
});
