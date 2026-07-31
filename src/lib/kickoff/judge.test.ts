import { describe, it, expect } from "vitest";
import { judgeAgreement, validateJudge, JUDGE_TRUST, type LabeledPlan, type Judge } from "./judge";

// Build n (human, judge) pairs with a fixed per-pair delta.
const pairs = (n: number, delta: number) =>
  Array.from({ length: n }, (_, i) => ({ human: ((i % 5) + 1), judge: ((i % 5) + 1) + delta }));

describe("judgeAgreement", () => {
  it("trusts a judge that matches humans across enough samples", () => {
    const r = judgeAgreement(pairs(JUDGE_TRUST.minN, 0));
    expect(r.mae).toBe(0);
    expect(r.withinOne).toBe(1);
    expect(r.correlation).toBeCloseTo(1);
    expect(r.trusted).toBe(true);
  });

  it("does not trust a judge that diverges by 2 on every plan", () => {
    const r = judgeAgreement(pairs(JUDGE_TRUST.minN, 2));
    expect(r.mae).toBe(2);
    expect(r.withinOne).toBe(0);
    expect(r.trusted).toBe(false); // MAE and within-one both fail
  });

  it("does not trust below the minimum sample size, even at perfect agreement", () => {
    const r = judgeAgreement(pairs(JUDGE_TRUST.minN - 1, 0));
    expect(r.mae).toBe(0);
    expect(r.trusted).toBe(false); // n gate
  });

  it("fails on correlation when the judge is off-by-one but uncorrelated", () => {
    // Constant judge score → within-one may hold but correlation is undefined.
    const flat = Array.from({ length: JUDGE_TRUST.minN }, (_, i) => ({ human: (i % 5) + 1, judge: 3 }));
    const r = judgeAgreement(flat);
    expect(r.correlation).toBeNull();
    expect(r.trusted).toBe(false);
  });

  it("reports n=0 safely", () => {
    const r = judgeAgreement([]);
    expect(r.n).toBe(0);
    expect(r.trusted).toBe(false);
  });
});

describe("validateJudge", () => {
  it("runs the injected judge over the labeled set and computes agreement (no LLM)", async () => {
    // Each plan carries its human score in barAlignment via humanScore; the fake
    // judge returns overall = that same value → perfect agreement, deterministic
    // without relying on object identity.
    const labeled: LabeledPlan[] = Array.from({ length: JUDGE_TRUST.minN }, (_, i) => ({
      plan: { executiveSummary: String((i % 5) + 1) } as unknown as LabeledPlan["plan"],
      audit: null,
      grounding: {} as LabeledPlan["grounding"],
      humanScore: (i % 5) + 1,
    }));
    const echoPlanScore: Judge = async (plan) => ({
      score: {
        overall: Number((plan as unknown as { executiveSummary: string }).executiveSummary),
        groundedness: 3, actionability: 3, barAlignment: 3, honesty: 3, rationale: "x",
      },
      inputTokens: 0,
      outputTokens: 0,
    });
    const r = await validateJudge(labeled, echoPlanScore);
    expect(r.pairs).toHaveLength(JUDGE_TRUST.minN);
    expect(r.mae).toBe(0);
    expect(r.trusted).toBe(true);
  });
});
