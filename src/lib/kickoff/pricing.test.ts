import { describe, it, expect, afterEach } from "vitest";
import { priceUsd, kickoffModel } from "./pricing";

const original = process.env.KICKOFF_MODEL;
afterEach(() => {
  if (original === undefined) delete process.env.KICKOFF_MODEL;
  else process.env.KICKOFF_MODEL = original;
});

describe("pricing", () => {
  it("prices a run from measured tokens at the model's rate", () => {
    // Opus 5: $5/1M in, $25/1M out.
    expect(priceUsd("claude-opus-5", 1_000_000, 0)).toBeCloseTo(5);
    expect(priceUsd("claude-opus-5", 0, 1_000_000)).toBeCloseTo(25);
    expect(priceUsd("claude-opus-5", 20_000, 8_000)).toBeCloseTo(0.3);
  });

  it("returns 0 for an unknown model rather than throwing", () => {
    // Telemetry-only: a mispriced run must never break the pipeline. The cost of
    // this choice is a silent $0 in the ledger if KICKOFF_MODEL is set to a
    // model missing from the table.
    expect(priceUsd("some-future-model", 1_000_000, 1_000_000)).toBe(0);
  });

  it("defaults to the Opus tier and honours KICKOFF_MODEL", () => {
    delete process.env.KICKOFF_MODEL;
    expect(kickoffModel()).toBe("claude-opus-5");
    process.env.KICKOFF_MODEL = "claude-sonnet-5";
    expect(kickoffModel()).toBe("claude-sonnet-5");
  });
});
