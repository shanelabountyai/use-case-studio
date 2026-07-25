import { describe, it, expect } from "vitest";
import { renderPlanMarkdown, DECISION_SUPPORT_DISCLAIMER } from "./export";
import type { IntegratedPlan, CriticAudit, Provenance } from "./contracts";

const plan: IntegratedPlan = {
  schemaVersion: "1",
  verdict: "BUILD",
  taskShape: "lookup",
  architecturePattern: "RAG + citation/refusal gates",
  executiveSummary: "A grounded RAG system.",
  sections: {
    architecture: { heading: "Architecture", markdown: "Retrieval with refusal gates." },
    dataPipeline: { heading: "Data pipeline", markdown: "Ingest, chunk, embed." },
    evaluation: { heading: "Evaluation", markdown: "Golden set; citation-correctness." },
    governance: { heading: "Governance", markdown: "Permission-aware retrieval." },
    delivery: { heading: "Delivery", markdown: "Eval-first quarter." },
  },
  dataFlows: [{ name: "online", steps: ["query", "retrieve", "answer"] }],
  milestones: [{ phase: "P1", goal: "MVP", exitCriterion: "golden set holds", duration: "~2 weeks (estimate)" }],
  assumptions: ["English corpus (estimate)"],
  refineGate: null,
};

const audit: CriticAudit = {
  schemaVersion: "1",
  fabricationScan: [{ quote: "99.9% accuracy", verdict: "must-remove" }],
  consistencyIssues: [],
  verdictIntegrity: { pass: true, note: "BUILD held" },
  gaps: [{ title: "ACL plumbing", detail: "identity→document ACL not addressed" }],
  acceptanceBarSpine: { isSpine: true, evidence: "milestones exit on the golden set" },
  overclaims: ["'always correct'"],
  verdict: "SHIP WITH FIXES",
  topFixes: ["add ACL step"],
};

const provenance: Provenance = {
  caseVersion: "sha256:abc",
  promptRosterVersion: "bk-p0-stub",
  model: "stub",
  modelParams: {},
  verdictAtGeneration: "BUILD",
  engineOutputsHash: "sha256:abc",
};

describe("renderPlanMarkdown", () => {
  const md = renderPlanMarkdown({ plan, audit, provenance, version: 1 });

  it("always binds the decision-support disclaimer", () => {
    expect(md).toContain(DECISION_SUPPORT_DISCLAIMER);
  });

  it("always attaches the critic audit (verdict, gaps, fixes)", () => {
    expect(md).toContain("Independent critic audit");
    expect(md).toContain("SHIP WITH FIXES");
    expect(md).toContain("ACL plumbing");
    expect(md).toContain("add ACL step");
  });

  it("renders plan sections, flows, milestones and provenance", () => {
    expect(md).toContain("Retrieval with refusal gates.");
    expect(md).toContain("query → retrieve → answer");
    expect(md).toContain("~2 weeks (estimate)");
    expect(md).toContain("bk-p0-stub");
    expect(md).toContain("sha256:abc");
  });

  it("renders the refine gate when present", () => {
    const refine = renderPlanMarkdown({
      plan: { ...plan, verdict: "REFINE", refineGate: { conditions: ["label data"], noGoConditions: ["bar unreachable → stop"] } },
      audit,
      provenance,
      version: 2,
    });
    expect(refine).toContain("Phase-0 refine gate");
    expect(refine).toContain("bar unreachable → stop");
    expect(refine).toContain("· v2");
  });
});
