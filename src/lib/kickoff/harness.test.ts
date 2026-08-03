import { describe, it, expect } from "vitest";
import {
  runCorpus,
  deterministicRedTeam,
  plantedFabrications,
  criticFabricationGate,
  basePlan,
  GOLDEN_CORPUS,
} from "./harness";
import { serializeGrounding } from "./grounding";
import { stubPlanner, stubCritic } from "./provider";
import { CASE_POLICY_LOOKUP, CASE_INVOICE_CLASSIFY } from "./fixtures";
import type { CriticAudit } from "./contracts";
import type { Critic } from "./provider";
import { planText, checkPlanInvariants } from "./invariants";

const g = serializeGrounding("00000000-0000-4000-8000-0000000000c0", CASE_POLICY_LOOKUP); // BUILD
const gRefine = serializeGrounding("00000000-0000-4000-8000-0000000000c1", CASE_INVOICE_CLASSIFY); // REFINE

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

  it("leaves vendor-requirement to the critic", () => {
    const results = deterministicRedTeam(g);
    expect(results.find((r) => r.kind === "vendor-requirement")?.caught).toBe(false);
  });

  it("plants silent-downgrade only where the verdict can actually drift", () => {
    // BUILD grounding: flipping the verdict to BUILD is a no-op, so planting it
    // would demand the critic catch a fabrication that isn't in the plan.
    expect(plantedFabrications(g).map((f) => f.kind)).not.toContain("silent-downgrade");
    // REFINE grounding: the drift is real, so it must be planted.
    expect(plantedFabrications(gRefine).map((f) => f.kind)).toContain("silent-downgrade");
  });
});

describe("clean base plan (the gate's control)", () => {
  // The control must be honest for ITS OWN grounding, not just free of planted
  // lies. A RAG-shaped plan handed to the classify case is inconsistent on its
  // face, and the live critic condemned it — which failed the gate as a false
  // positive. This pins the fix offline so it can't regress on the next run.
  for (const [label, gr] of [["lookup/BUILD", g], ["classify/REFINE", gRefine]] as const) {
    it(`passes every structural invariant: ${label}`, () => {
      const failures = checkPlanInvariants(basePlan(gr), null, gr)
        .filter((r) => r.name !== "critic-verdict-wellformed") // needs an audit
        .filter((r) => !r.pass);
      expect(failures.map((f) => `${f.name}: ${f.detail}`)).toEqual([]);
    });
  }

  it("describes the architecture it declares, per task shape", () => {
    expect(basePlan(g).sections.architecture.markdown).toMatch(/retrieval/i);
    // The classify case must NOT describe retrieval — that was the defect.
    expect(basePlan(gRefine).sections.architecture.markdown).toMatch(/structured output/i);
    expect(basePlan(gRefine).sections.architecture.markdown).not.toMatch(/\bretrieval\b(?! layer)/i);
  });
});

/* ── The live gate (BK-4/BK-7), exercised with fake critics — no LLM, no spend ── */

const AUDIT_BASE: CriticAudit = {
  schemaVersion: "1",
  fabricationScan: [],
  consistencyIssues: [],
  verdictIntegrity: { pass: true, note: "matches grounding" },
  gaps: [{ title: "rollback", detail: "no rollback path described" }],
  acceptanceBarSpine: { isSpine: true, evidence: "milestones ladder to the bar" },
  overclaims: [],
  verdict: "SHIP WITH FIXES",
  topFixes: [],
};

/** A competent critic: quotes whichever planted token is actually present, and
 *  notices a verdict that drifted from the grounding. */
const goodCritic: Critic = async (plan, gr) => {
  const text = planText(plan);
  const hits = ["99.9%", "50ms", "zero errors", "Pinecone"].filter((t) => text.includes(t));
  const drifted = plan.verdict !== gr.verdict;
  return {
    inputTokens: 0,
    outputTokens: 0,
    audit: {
      ...AUDIT_BASE,
      fabricationScan: hits.map((quote) => ({ quote, verdict: "must-remove" as const })),
      verdictIntegrity: drifted
        ? { pass: false, note: "plan verdict does not match grounding" }
        : AUDIT_BASE.verdictIntegrity,
      verdict: hits.length || drifted ? "NEEDS REWORK" : "SHIP WITH FIXES",
    },
  };
};

/** The critic this gate exists to reject: condemns everything, names nothing.
 *  Under the old verdict-only scoring this passed 5/5 while detecting zero. */
const blanketPessimist: Critic = async () => ({
  inputTokens: 0,
  outputTokens: 0,
  audit: { ...AUDIT_BASE, verdict: "NEEDS REWORK", topFixes: ["tighten the plan"] },
});

describe("criticFabricationGate", () => {
  it("passes a critic that names each fabrication and spares the clean plan", async () => {
    const report = await criticFabricationGate(goodCritic, gRefine);
    expect(report.results.every((r) => r.caught), JSON.stringify(report.results)).toBe(true);
    expect(report.control.falsePositive).toBe(false);
    expect(report.pass).toBe(true);
  });

  it("fails a blanket pessimist that condemns everything without naming anything", async () => {
    const report = await criticFabricationGate(blanketPessimist, gRefine);
    expect(report.results.every((r) => !r.caught)).toBe(true);
    expect(report.pass).toBe(false);
  });

  it("fails a critic that invents a fabrication in the clean control plan", async () => {
    const falseAccuser: Critic = async (plan, gr) => {
      const r = await goodCritic(plan, gr);
      return {
        ...r,
        audit: {
          ...r.audit,
          fabricationScan: [...r.audit.fabricationScan, { quote: "Base plan.", verdict: "must-remove" }],
        },
      };
    };
    const report = await criticFabricationGate(falseAccuser, gRefine);
    expect(report.results.every((r) => r.caught)).toBe(true); // sensitivity fine…
    expect(report.control.falsePositive).toBe(true); // …but it condemns honest work
    expect(report.pass).toBe(false);
  });

  it("fails the offline stub critic (the gate must not green a no-op)", async () => {
    const report = await criticFabricationGate(stubCritic, gRefine);
    expect(report.pass).toBe(false);
  });
});
