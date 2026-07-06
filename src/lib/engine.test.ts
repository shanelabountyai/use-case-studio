import { describe, it, expect } from "vitest";
import { blankCase, evaluate, recArchitecture, libraryToCsv, buildObsidianNote, type UseCase } from "./engine";

const policyAssistant = (): UseCase => ({
  ...blankCase(),
  name: "Internal policy & knowledge assistant",
  problem: "x", currentCost: "x", users: "x", outcome: "x",
  acceptanceBar: ">=90% correct-with-citation on a 100-question set",
  dataSources: "Policy PDFs", dataFormat: "documents", dataVolume: "medium",
  dataSensitivity: "internal", dataFreshness: "periodic", latency: "interactive",
  budget: "x", compliance: "x", oversight: "spot-check", taskVolume: "high", taskShape: "lookup",
  scores: { value: 4, feasibility: 4, dataReadiness: 3, risk: 4, cost: 4, timeToValue: 4, fit: 4 },
});

describe("evaluate", () => {
  it("reproduces the reference artifact's known output (77 / BUILD / Quick win)", () => {
    const ev = evaluate(policyAssistant());
    expect(Math.round(ev.composite)).toBe(77);
    expect(ev.verdict).toBe("BUILD");
    expect(ev.quadrant).toBe("Quick win");
  });

  it("caps at REFINE when data readiness is critical, regardless of composite", () => {
    const uc = policyAssistant();
    uc.scores.dataReadiness = 1;
    expect(evaluate(uc).verdict).toBe("REFINE");
  });

  it("respects tunable thresholds", () => {
    const uc = policyAssistant();
    uc.thresholds = { build: 80, refine: 45 };
    expect(evaluate(uc).verdict).toBe("REFINE");
  });

  it("flags a missing acceptance bar", () => {
    const uc = policyAssistant();
    uc.acceptanceBar = "";
    expect(evaluate(uc).flags.some((f) => f.text.includes("acceptance bar"))).toBe(true);
  });
});

describe("recArchitecture", () => {
  it("maps document lookup to RAG", () => {
    expect(recArchitecture(policyAssistant()).pattern).toMatch(/RAG/);
  });
  it("requires an approval gate for action-taking tasks", () => {
    const uc = { ...policyAssistant(), taskShape: "actions" };
    expect(recArchitecture(uc).hitl).toMatch(/approval gate/i);
  });
});

describe("exports", () => {
  it("escapes CSV cells containing commas and quotes", () => {
    const uc = policyAssistant();
    uc.problem = 'has, commas and "quotes"';
    const csv = libraryToCsv([{ id: "1", savedAt: "2026-07-05T00:00:00Z", uc, verdict: "BUILD", composite: 77, quadrant: "Quick win" }]);
    expect(csv).toContain('"has, commas and ""quotes"""');
  });
  it("emits valid YAML-frontmatter Obsidian notes", () => {
    const note = buildObsidianNote(policyAssistant(), "2026-07-05T00:00:00Z");
    expect(note.startsWith("---\n")).toBe(true);
    expect(note).toContain("verdict: BUILD");
    expect(note).toContain("[[AI Use-Case Register]]");
  });
});
