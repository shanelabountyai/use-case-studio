import { describe, it, expect } from "vitest";
import { blankCase, type UseCase, type LibraryRecord } from "./engine";
import { blankEngagement, buildDiscoveryGuide, buildPortfolio, buildSow, buildDeliveryPlan, buildRiskRegister, deliveryKitToMarkdown } from "./deliverykit";

const policy = (): UseCase => ({
  ...blankCase(),
  name: "Internal policy & knowledge assistant",
  problem: "Repeat policy questions", currentCost: "~30 hrs/week (team estimate)",
  users: "All employees", outcome: "Self-serve cited answers",
  acceptanceBar: ">=90% correct-with-citation on a 100-question set",
  dataSources: "SharePoint policy PDFs", dataFormat: "documents", dataVolume: "medium",
  dataSensitivity: "internal", dataFreshness: "periodic", latency: "interactive",
  budget: "pilot", compliance: "internal only", oversight: "spot-check", taskVolume: "high", taskShape: "lookup",
  scores: { value: 4, feasibility: 4, dataReadiness: 3, risk: 4, cost: 4, timeToValue: 4, fit: 4 },
});

describe("discovery guide", () => {
  it("adds a targeted probe when the acceptance bar is missing", () => {
    const uc = policy(); uc.acceptanceBar = "";
    const g = buildDiscoveryGuide(uc);
    const all = g.sections.flatMap((s) => s.questions).join(" ");
    expect(all).toMatch(/no measurable acceptance bar|acceptance bar/i);
    expect(all).toContain("PROBE");
  });
});

describe("SOW", () => {
  it("ties acceptance criteria to the case's acceptance bar and carries a not-legal-advice disclaimer", () => {
    const sow = buildSow(policy(), blankEngagement());
    expect(sow.disclaimer).toMatch(/not legal advice/i);
    const accept = sow.sections.find((s) => s.heading === "Acceptance criteria");
    expect(accept?.body).toContain("90% correct-with-citation");
  });
  it("prepends a readiness note when the verdict is not BUILD", () => {
    const uc = policy(); uc.scores.dataReadiness = 1; // forces critical -> REFINE
    const sow = buildSow(uc, blankEngagement());
    expect(sow.sections[0].heading).toBe("Readiness note");
  });
});

describe("delivery plan", () => {
  it("has all six CPMAI phases ending in Operationalization", () => {
    const plan = buildDeliveryPlan(policy(), blankEngagement());
    expect(plan.phases).toHaveLength(6);
    expect(plan.phases[5].phase).toMatch(/Operationalization/);
  });
});

describe("risk register", () => {
  it("raises a data risk when readiness is low and always includes adoption risk", () => {
    const uc = policy(); uc.scores.dataReadiness = 2;
    const reg = buildRiskRegister(uc);
    expect(reg.risks.some((r) => r.category === "Data")).toBe(true);
    expect(reg.risks.some((r) => r.category === "Adoption")).toBe(true);
  });
});

describe("portfolio", () => {
  it("ranks by composite and sequences quick wins first", () => {
    const mk = (name: string, composite: number, quadrant: string, verdict: any): LibraryRecord =>
      ({ id: name, savedAt: "2026-07-05T00:00:00Z", uc: { ...policy(), name }, verdict, composite, quadrant });
    const p = buildPortfolio([
      mk("Big", 72, "Big bet", "BUILD"),
      mk("Quick", 68, "Quick win", "BUILD"),
    ]);
    expect(p.ranked[0].name).toBe("Big");            // ranked by score
    expect(p.sequencing[0]).toContain("Quick");      // sequenced quick-win first
  });
});

describe("full markdown", () => {
  it("assembles all four sections", () => {
    const md = deliveryKitToMarkdown(policy(), { ...blankEngagement(), client: "Acme" });
    ["Discovery guide", "Statement of work", "delivery plan", "Risk register"].forEach((h) => expect(md).toContain(h));
  });
});
