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
  milestones: [
    { phase: "P0", goal: "author the golden set", exitCriterion: "golden set authored and frozen by its named owner", duration: "~1 week (estimate)" },
    { phase: "P1", goal: "MVP", exitCriterion: "golden set holds", duration: "~2 weeks (estimate)" },
  ],
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

  it("still flags the planted fabrications (regression guard for the live gate)", () => {
    expect(flagUnlabeledMetrics("Achieves 99.9% accuracy on all queries.", [])).toContain("99.9%");
    expect(flagUnlabeledMetrics("Responds in <50ms under all load.", [])).toContain("50ms");
  });

  it("spares honest proportions and target/estimate framing (over-broad-metric fix)", () => {
    // Proportion — the live false positive: "defers 40% of documents".
    expect(flagUnlabeledMetrics("A classifier that defers 40% of documents.", [])).toHaveLength(0);
    expect(flagUnlabeledMetrics("Roughly 30% of cases need review.", [])).toHaveLength(0);
    // Target / analysis framing.
    expect(flagUnlabeledMetrics("Aim for 90% per-category recall.", [])).toHaveLength(0);
    expect(flagUnlabeledMetrics("A 10% improvement in throughput.", [])).toHaveLength(0);
  });

  it("flags guarantee language", () => {
    expect(flagGuarantees("This guarantees zero errors and prevents leakage.").length).toBeGreaterThan(0);
    expect(flagGuarantees("This aims to reduce errors.")).toHaveLength(0);
  });

  it("spares negated/disclaimed guarantees but not across a clause boundary", () => {
    // The live false positive: an explicit disclaimer.
    expect(flagGuarantees("No real-time routing guarantee is implied.")).toHaveLength(0);
    expect(flagGuarantees("We cannot guarantee zero downtime.")).toHaveLength(0);
    // A negation in an EARLIER clause must not spare a real claim in a later one.
    expect(flagGuarantees("There is no risk; the system guarantees zero errors.").length).toBeGreaterThan(0);
  });

  it("treats 'guarantee' as scoped — honest noun/contrastive uses pass, absolute-outcome guarantees flag", () => {
    // The two live false positives.
    expect(flagGuarantees("These are estimates rather than a guaranteed run rate.")).toHaveLength(0);
    expect(flagGuarantees("Governance includes a documented deferral guarantee.")).toHaveLength(0);
    // Still catches a guarantee bound to an absolute outcome.
    expect(flagGuarantees("The design guarantees zero errors.").length).toBeGreaterThan(0);
  });

  it("flags absolute-scoped claims but not ordinary engineering verbs", () => {
    // Overclaims: the verb is bound to an absolute scope.
    expect(flagGuarantees("It prevents any leakage.").length).toBeGreaterThan(0);
    expect(flagGuarantees("This ensures no errors reach the user.").length).toBeGreaterThan(0);

    // Honest prose. The live planner wrote the first of these and the old
    // single-list regex failed the whole plan on it.
    expect(flagGuarantees("Audience-restricted content filters can be enforced if any exist.")).toHaveLength(0);
    expect(flagGuarantees("Access controls are enforced at the retrieval layer.")).toHaveLength(0);
    expect(flagGuarantees("Ensure the index is rebuilt when a source changes.")).toHaveLength(0);
    expect(flagGuarantees("A confidence threshold prevents low-confidence auto-routing.")).toHaveLength(0);
  });

  it("still catches the planted guarantee fabrication", () => {
    const planted = "This design guarantees zero errors and prevents any leakage.";
    expect(flagGuarantees(planted).length).toBeGreaterThan(0);
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

  it("flags an architecture swap but tolerates a restatement of the same family", () => {
    // g.recommendation.architecturePattern is RAG (lookup + documents).
    const swapped = { ...okPlan, architecturePattern: "Fine-tuned classifier on the corpus" };
    const arch = checkPlanInvariants(swapped, null, g).find((r) => r.name === "architecture-family-match");
    expect(arch?.pass).toBe(false);

    const restated = { ...okPlan, architecturePattern: "A RAG pipeline over the policy corpus" };
    const ok = checkPlanInvariants(restated, null, g).find((r) => r.name === "architecture-family-match");
    expect(ok?.pass).toBe(true);
  });

  it("does not flag an architecture pattern it cannot classify", () => {
    const odd = { ...okPlan, architecturePattern: "Bespoke in-house approach" };
    const arch = checkPlanInvariants(odd, null, g).find((r) => r.name === "architecture-family-match");
    expect(arch?.pass).toBe(true);
  });

  /* The gap that motivated this invariant, reproduced from the real packages:
     every phase consumes the golden set, none assembles it. */
  it("fails eval-asset-owned when milestones only consume the golden set", () => {
    const consumesOnly: IntegratedPlan = {
      ...okPlan,
      milestones: [
        { phase: "P1", goal: "MVP", exitCriterion: "10 golden-set cases generated end to end" },
        { phase: "P2", goal: "evaluate", exitCriterion: "run the full golden set; ≥90% holds" },
      ],
    };
    const r = checkPlanInvariants(consumesOnly, null, g).find((x) => x.name === "eval-asset-owned");
    expect(r?.pass).toBe(false);
  });

  it("passes eval-asset-owned when one milestone assembles the asset", () => {
    const r = checkPlanInvariants(okPlan, null, g).find((x) => x.name === "eval-asset-owned");
    expect(r?.pass).toBe(true);
  });

  it("passes eval-asset-owned vacuously when the plan leans on no eval asset", () => {
    const noAsset: IntegratedPlan = {
      ...okPlan,
      executiveSummary: "RAG over the corpus; ≥90% correct-with-citation.",
      sections: { ...okPlan.sections, evaluation: { heading: "Eval", markdown: "Citation-correctness scored per query; refuse on low confidence." } },
      milestones: [{ phase: "P1", goal: "MVP", exitCriterion: "≥90% correct-with-citation" }],
    };
    const r = checkPlanInvariants(noAsset, null, g).find((x) => x.name === "eval-asset-owned");
    expect(r?.pass).toBe(true);
  });

  it("does not let one phase's verb launder another phase's asset", () => {
    // "curated" belongs to the corpus milestone, not the golden-set one — the
    // flattened-text version of this check passed it.
    const laundered: IntegratedPlan = {
      ...okPlan,
      milestones: [
        { phase: "P1", goal: "ingest", exitCriterion: "source corpus curated and indexed" },
        { phase: "P2", goal: "evaluate", exitCriterion: "run the full golden set; ≥90% holds" },
      ],
    };
    const r = checkPlanInvariants(laundered, null, g).find((x) => x.name === "eval-asset-owned");
    expect(r?.pass).toBe(false);
  });

  it("fails critic-verdict-wellformed when no audit is attached", () => {
    const critic = checkPlanInvariants(okPlan, null, g).find((r) => r.name === "critic-verdict-wellformed");
    expect(critic?.pass).toBe(false);
  });
});
