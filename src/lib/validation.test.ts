import { describe, it, expect } from "vitest";
import { blankCase } from "./engine";
import { parseUseCase } from "./validation";

describe("parseUseCase — accepts and normalizes", () => {
  it("accepts a well-formed case unchanged", () => {
    const uc = blankCase();
    const r = parseUseCase(uc);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.scores.value).toBe(3);
  });

  it("defaults missing string fields to empty rather than rejecting", () => {
    const uc = { ...blankCase() } as Record<string, unknown>;
    delete uc.compliance;
    const r = parseUseCase(uc);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.compliance).toBe("");
  });

  it("preserves unknown fields (engine ignores them; DK-1 engagement rides along)", () => {
    const uc = { ...blankCase(), engagement: { client: "Acme" } };
    const r = parseUseCase(uc);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.data as Record<string, unknown>).engagement).toEqual({ client: "Acme" });
  });
});

describe("parseUseCase — clamps out-of-range numerics", () => {
  it("clamps scores above 5 and below 0 into range", () => {
    const uc = blankCase();
    uc.scores.value = 9;
    uc.scores.risk = -4;
    const r = parseUseCase(uc);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.scores.value).toBe(5);
      expect(r.data.scores.risk).toBe(0);
    }
  });

  it("clamps negative weights to zero", () => {
    const uc = blankCase();
    uc.weights.value = -10;
    const r = parseUseCase(uc);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.weights.value).toBe(0);
  });
});

describe("parseUseCase — rejects structural garbage", () => {
  it("rejects null / non-object input", () => {
    expect(parseUseCase(null).ok).toBe(false);
    expect(parseUseCase("nope").ok).toBe(false);
    expect(parseUseCase(42).ok).toBe(false);
  });

  it("rejects a wrong-typed string field (no coercion)", () => {
    const uc = { ...blankCase(), name: 123 };
    expect(parseUseCase(uc).ok).toBe(false);
  });

  it("rejects a missing scores object", () => {
    const uc = { ...blankCase() } as Record<string, unknown>;
    delete uc.scores;
    expect(parseUseCase(uc).ok).toBe(false);
  });

  it("rejects a non-numeric score (e.g. 'high')", () => {
    const uc = blankCase() as unknown as Record<string, Record<string, unknown>>;
    uc.scores = { ...uc.scores, value: "high" };
    expect(parseUseCase(uc).ok).toBe(false);
  });
});
