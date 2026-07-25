import { describe, it, expect } from "vitest";
import { runCorpus, deterministicRedTeam, plantedFabrications, GOLDEN_CORPUS } from "./harness";
import { serializeGrounding } from "./grounding";
import { stubPlanner, stubCritic } from "./provider";
import { CASE_POLICY_LOOKUP } from "./fixtures";

const g = serializeGrounding("00000000-0000-4000-8000-0000000000c0", CASE_POLICY_LOOKUP);

describe("golden corpus", () => {
  it("has the P0 set: two plan cases, a PARK, and a thin refuse", () => {
    expect(GOLDEN_CORPUS.map((c) => c.expect).sort()).toEqual(["park", "plan", "plan", "refuse-thin"]);
  });

  it("runCorpus produces a well-formed per-invariant report over the stub pipeline", async () => {
    const report = await runCorpus({ planner: stubPlanner, critic: stubCritic });
    // PARK + thin cases correctly refuse without a plan
    expect(report.cases.find((c) => c.name.includes("thin"))?.note).toMatch(/refused/);
    expect(report.cases.find((c) => c.name.includes("parked"))?.note).toMatch(/parked/);
    // plan cases ran and were scored against the invariants
    expect(report.cases.filter((c) => c.ran)).toHaveLength(2);
    expect(report.perInvariant["critic-verdict-wellformed"].total).toBe(2);
    expect(report.passRate).toBeGreaterThanOrEqual(0);
  });
});

describe("planted-fabrication red-team (deterministic half)", () => {
  it("catches every deterministically-catchable fabrication", () => {
    const results = deterministicRedTeam(g);
    for (const f of plantedFabrications(g)) {
      const got = results.find((r) => r.kind === f.kind)!;
      if (f.deterministicallyCatchable) expect(got.caught, `${f.kind} must be caught offline`).toBe(true);
    }
  });

  it("leaves vendor-requirement and silent-downgrade to the critic / verdict gate", () => {
    const results = deterministicRedTeam(g);
    expect(results.find((r) => r.kind === "vendor-requirement")?.caught).toBe(false);
    expect(results.find((r) => r.kind === "silent-downgrade")?.caught).toBe(false);
  });
});
