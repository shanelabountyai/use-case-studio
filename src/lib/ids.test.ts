import { describe, it, expect } from "vitest";
import { isUuid, safeEqual } from "./ids";

describe("isUuid", () => {
  it("accepts canonical UUIDs (any case), as Postgres gen_random_uuid() emits", () => {
    expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
    expect(isUuid(crypto.randomUUID())).toBe(true);
    expect(isUuid("ABCDEF01-2345-4789-8BCD-EF0123456789")).toBe(true);
  });

  it("rejects anything Postgres would refuse to cast, plus non-strings", () => {
    for (const v of ["", "job-1", "unsaved-abc", "00000000-0000-0000-0000-00000000000", "00000000000000000000000000000000",
      " 00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000000'--", null, undefined, 42, {}]) {
      expect(isUuid(v)).toBe(false);
    }
  });
});

describe("safeEqual", () => {
  it("is true only for identical strings", () => {
    expect(safeEqual("Bearer abc", "Bearer abc")).toBe(true);
    expect(safeEqual("Bearer abc", "Bearer abd")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
    expect(safeEqual("short", "a much longer secret value")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
