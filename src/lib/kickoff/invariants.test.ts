import { describe, it, expect } from "vitest";
import { flagGuarantees, flagUnlabeledMetrics, checkPlanInvariants } from "./invariants";
import { serializeGrounding } from "./grounding";
import { CASE_POLICY_LOOKUP } from "./fixtures";
import type { IntegratedPlan } from "./contracts";

const ID = "00000000-0000-4000-8000-0000000000c0";
const g = serializeGrounding(ID, CASE_POLICY_LOOKUP); // acceptanceBar has "≥90%"

const okPlan: IntegratedPlan = {
  schemaVersion: "1",
  verdict: "BUILD",
  taskShape: "lookup",
  architecturePattern: g.recommendation.architecturePattern,
  executiveSummary: "RAG over the corpus; ≥90% correct-with-citation on the golden set.",
  sections: {
    architecture: { heading: "Architecture", markdown: "Retrieval with refusal gates and citations." },
    dataPipeline: { heading: "Data", markdown: "Ingest, chunk, embed." },
    evaluation: { heading: "Eval", markdown: "Golden set; citation-correctness; refuse on low confidence." },
    governance: { heading: "Governance", markdown: "Permission-aware retrieval." },
    delivery: { heading: "Delivery", markdown: "~12 weeks (estimate)." },
  },
  dataFlows: [{ name: "online", steps: ["query", "retrieve", "answer"] }],
  milestones: [{ phase: "P1", goal: "MVP", exitCriterion: "golden set holds", duration: "~2 weeks (estimate)" }],
  assumptions: ["English corpus (estimate)"],
  refineGate: null,
};

describe("detectors", () => {
  it("flags a fabricated benchmark but not a labeled estimate or the bar target", () => {
    expect(flagUnlabeledMetrics("Achieves 99.9% accuracy.", [])).toContain("99.9%");
    expect(flagUnlabeledMetrics("Ships in ~12 weeks (estimate); cost $5,000 estimate.", [])).toHaveLength(0);
    // ≥90% is the acceptance-bar target → allowed
    expect(flagUnlabeledMetrics("Exit: 90% correct-with-citation.", ["90%"])).toHaveLength(0);
  });

  it("flags guarantee language", () => {
    expect(flagGuarantees("This guarantees zero errors and prevents leakage.").length).toBeGreaterThan(0);
    expect(flagGuarantees("This aims to reduce errors.")).toHaveLength(0);
  });
});

describe("checkPlanInvariants", () => {
  it("a clean lookup plan passes every invariant", () => {
    const rs = checkPlanInvariants(okPlan, {
      schemaVersion: "1", fabricationScan: [], consistencyIssues: [], verdictIntegrity: { pass: true, note: "" },
      gaps: [{ title: "g", detail: "d" }], acceptanceBarSpine: { isSpine: true, evidence: "" }, overclaims: [],
      verdict: "SHIP WITH FIXES", topFixes: ["a"],
    }, g);
    expect(rs.every((r) => r.pass)).toBe(true);
  });

  it("fails eval-vocabulary when the lookup vocabulary is absent anywhere in the plan", () => {
    const generic = (h: string) => ({ heading: h, markdown: "We will test it thoroughly." });
    const stripped: IntegratedPlan = {
      ...okPlan,
      executiveSummary: "A retrieval plan; targets ≥90% on the review set.",
      sections: {
        architecture: generic("Architecture"),
        dataPipeline: generic("Data"),
        evaluation: generic("Eval"),
        governance: generic("Governance"),
        delivery: generic("Delivery"),
      },
      milestones: [{ phase: "P1", goal: "MVP", exitCriterion: "≥90% on the review set" }],
      assumptions: [],
    };
    const vocab = checkPlanInvariants(stripped, null, g).find((r) => r.name === "eval-vocabulary");
    expect(vocab?.pass).toBe(false);
  });

  it("fails the spine check when the bar is never referenced", () => {
    const noBar = { ...okPlan, executiveSummary: "A plan.", sections: { ...okPlan.sections, evaluation: { heading: "Eval", markdown: "Golden set with citation checks and refusal." } }, milestones: [{ phase: "P1", goal: "x", exitCriterion: "done" }] };
    const spine = checkPlanInvariants(noBar, null, g).find((r) => r.name === "acceptance-bar-spine");
    expect(spine?.pass).toBe(false);
  });

  it("fails critic-verdict-wellformed when no audit is attached", () => {
    const critic = checkPlanInvariants(okPlan, null, g).find((r) => r.name === "critic-verdict-wellformed");
    expect(critic?.pass).toBe(false);
  });
});
