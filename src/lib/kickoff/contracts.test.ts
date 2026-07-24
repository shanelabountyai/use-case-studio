import { describe, it, expect } from "vitest";
import {
  GroundingInput,
  IntegratedPlan,
  CriticAudit,
  BuildKickoffPlan,
} from "./contracts";

/* BK-0 schema tests: valid fixtures parse; required-field omission fails; the
   two IntegratedPlan superRefine branches; persisted-record round-trip. */

const UUID = "00000000-0000-4000-8000-000000000000";

const grounding = {
  caseId: UUID,
  caseVersion: "sha:abc",
  name: "Contract search",
  verdict: "BUILD",
  composite: 77,
  quadrant: "Quick win",
  taskShape: "lookup",
  acceptanceBar: "Answers cite a source or refuse; 0 fabricated citations in the golden set.",
  useCase: { name: "Contract search", extraKeyRidesAlong: true },
  evaluation: {
    flags: [{ sev: "warn", text: "data freshness unspecified" }],
    contribs: [{ key: "value", label: "Value", score: 4, weight: 0.2 }],
  },
  recommendation: {
    architecturePattern: "RAG + citation/refusal gates",
    architectureWhy: "lookup task over a document corpus",
    hitl: "spot-check",
    dataAccess: ["contract PDFs", "metadata index"],
    testingLayers: [{ name: "golden set", body: "citation-correctness" }],
    crisp: [{ phase: "Data Understanding", actions: ["inventory corpus"] }],
  },
} as const;

const buildPlan = {
  schemaVersion: "1",
  verdict: "BUILD",
  taskShape: "lookup",
  architecturePattern: "RAG + citation/refusal gates",
  executiveSummary: "A grounded retrieval system with refusal gates.",
  sections: {
    architecture: { heading: "Architecture", markdown: "..." },
    dataPipeline: { heading: "Data", markdown: "..." },
    evaluation: { heading: "Eval", markdown: "..." },
    governance: { heading: "Governance", markdown: "..." },
    delivery: { heading: "Delivery", markdown: "..." },
  },
  dataFlows: [{ name: "ingest", steps: ["parse", "chunk", "embed"] }],
  milestones: [{ phase: "P1", goal: "retrieval MVP", exitCriterion: "golden set ≥0.9" }],
  assumptions: ["corpus is English (estimate)"],
  refineGate: null,
} as const;

describe("GroundingInput", () => {
  it("parses a valid fixture and keeps opaque useCase keys", () => {
    const g = GroundingInput.parse(grounding);
    expect(g.useCase.extraKeyRidesAlong).toBe(true);
    expect(g.verdict).toBe("BUILD");
  });

  it("rejects a missing required field (acceptanceBar)", () => {
    const { acceptanceBar, ...missing } = grounding;
    expect(GroundingInput.safeParse(missing).success).toBe(false);
  });

  it("rejects an unknown verdict", () => {
    expect(GroundingInput.safeParse({ ...grounding, verdict: "SHIP" }).success).toBe(false);
  });
});

describe("IntegratedPlan superRefine", () => {
  it("accepts a BUILD plan with refineGate null", () => {
    expect(IntegratedPlan.safeParse(buildPlan).success).toBe(true);
  });

  it("rejects a REFINE plan lacking a refineGate", () => {
    const r = IntegratedPlan.safeParse({ ...buildPlan, verdict: "REFINE", refineGate: null });
    expect(r.success).toBe(false);
  });

  it("rejects a non-REFINE plan carrying a refineGate", () => {
    const r = IntegratedPlan.safeParse({
      ...buildPlan,
      verdict: "BUILD",
      refineGate: { conditions: ["x"], noGoConditions: ["y"] },
    });
    expect(r.success).toBe(false);
  });

  it("accepts a REFINE plan with a real no-go", () => {
    const r = IntegratedPlan.safeParse({
      ...buildPlan,
      verdict: "REFINE",
      refineGate: { conditions: ["label training data"], noGoConditions: ["recall <0.7 → stop"] },
    });
    expect(r.success).toBe(true);
  });

  it("rejects a dataFlow with zero steps", () => {
    const r = IntegratedPlan.safeParse({ ...buildPlan, dataFlows: [{ name: "x", steps: [] }] });
    expect(r.success).toBe(false);
  });
});

describe("CriticAudit", () => {
  const audit = {
    schemaVersion: "1",
    fabricationScan: [{ quote: "99.9% accuracy", verdict: "must-remove" }],
    consistencyIssues: [],
    verdictIntegrity: { pass: true, note: "BUILD held" },
    gaps: [{ title: "ACL plumbing", detail: "identity→document ACL not addressed" }],
    acceptanceBarSpine: { isSpine: true, evidence: "milestones exit on the golden set" },
    overclaims: [],
    verdict: "SHIP WITH FIXES",
    topFixes: ["label the accuracy claim", "add ACL step", "name the refresh cadence"],
  };

  it("parses a valid audit", () => {
    expect(CriticAudit.safeParse(audit).success).toBe(true);
  });

  it("requires at least one gap", () => {
    expect(CriticAudit.safeParse({ ...audit, gaps: [] }).success).toBe(false);
  });

  it("caps topFixes at 3", () => {
    expect(CriticAudit.safeParse({ ...audit, topFixes: ["a", "b", "c", "d"] }).success).toBe(false);
  });
});

describe("BuildKickoffPlan record", () => {
  it("round-trips a complete draft with plan + audit null-allowed", () => {
    const rec = {
      id: UUID,
      caseId: UUID,
      ownerId: "user_1",
      version: 1,
      status: "queued",
      plan: null,
      audit: null,
      laneStatus: { planner: "ok", critic: "skipped" },
      provenance: {
        caseVersion: "sha:abc",
        promptRosterVersion: "v1",
        model: "stub",
        modelParams: { temperature: 0 },
        verdictAtGeneration: "BUILD",
        engineOutputsHash: "sha:def",
      },
      cost: null,
      approvedAt: null,
      createdAt: new Date().toISOString(),
    };
    expect(BuildKickoffPlan.safeParse(rec).success).toBe(true);
  });

  it("rejects an unknown status", () => {
    const bad = { status: "pending" } as unknown;
    expect(BuildKickoffPlan.safeParse(bad).success).toBe(false);
  });
});
