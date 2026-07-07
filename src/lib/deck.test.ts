import { describe, it, expect } from "vitest";
import { blankCase, evaluate, type UseCase } from "./engine";
import { blankEngagement } from "./deliverykit";
import { buildDeck, deckToText } from "./deck";

const policy = (): UseCase => ({
  ...blankCase(),
  name: "Internal policy & knowledge assistant",
  problem: "Repeat policy questions", currentCost: "~30 hrs/week",
  outcome: "Self-serve cited answers", acceptanceBar: ">=90% correct-with-citation",
  dataSources: "SharePoint PDFs", dataFormat: "documents", dataVolume: "medium",
  dataSensitivity: "internal", dataFreshness: "periodic", latency: "interactive",
  oversight: "spot-check", taskVolume: "high", taskShape: "lookup",
  scores: { value: 4, feasibility: 4, dataReadiness: 3, risk: 4, cost: 4, timeToValue: 4, fit: 4 },
});

const deckFor = (uc: UseCase) => buildDeck(uc, evaluate(uc), blankEngagement());

describe("buildDeck", () => {
  it("produces the seven expected slides in order", () => {
    const deck = deckFor(policy());
    expect(deck.slides.map((s) => s.kind)).toEqual([
      "title", "summary", "discovery", "scores", "plan", "risks", "sow",
    ]);
  });

  it("titles the deck with the case name and pins the verdict on the title slide", () => {
    const deck = deckFor(policy());
    const title = deck.slides[0];
    expect(deck.title).toBe("Internal policy & knowledge assistant");
    expect(title.kind).toBe("title");
    if (title.kind === "title") {
      expect(title.verdict).toBe(evaluate(policy()).verdict); // engine-computed, not invented
      expect(title.subtitle).toContain("composite");
    }
  });

  it("maps all seven dimension scores onto the scores slide", () => {
    const deck = deckFor(policy());
    const scores = deck.slides.find((s) => s.kind === "scores");
    expect(scores?.kind === "scores" && scores.scores).toHaveLength(7);
  });

  it("carries all six CPMAI phases on the plan slide", () => {
    const deck = deckFor(policy());
    const plan = deck.slides.find((s) => s.kind === "plan");
    expect(plan?.kind === "plan" && plan.phases).toHaveLength(6);
  });

  it("carries one risk-register row per builder risk with the L/I column", () => {
    const deck = deckFor(policy());
    const risks = deck.slides.find((s) => s.kind === "risks");
    if (risks?.kind !== "risks") throw new Error("no risks slide");
    expect(risks.headers).toEqual(["ID", "Risk", "Category", "L/I", "Mitigation", "Owner"]);
    expect(risks.rows.length).toBeGreaterThan(0);
    expect(risks.rows[0][3]).toMatch(/^(Low|Medium|High)\/(Low|Medium|High)$/);
  });
});

describe("buildDeck — honesty rules carry into the deck text", () => {
  it("includes the SOW not-legal-advice disclaimer", () => {
    const text = deckToText(deckFor(policy()));
    expect(text).toMatch(/not legal advice/i);
  });

  it("includes the CPMAI trademark / independence line (from the plan note)", () => {
    const text = deckToText(deckFor(policy()));
    expect(text).toMatch(/CPMAI is a trademark of its respective owner; this tool is independent/i);
  });

  it("surfaces the SOW readiness note path for a non-BUILD case without inventing numbers", () => {
    const uc = blankCase(); // REFINE
    const ev = evaluate(uc);
    expect(ev.verdict).not.toBe("BUILD");
    const deck = buildDeck(uc, ev, blankEngagement());
    const summary = deck.slides.find((s) => s.kind === "summary");
    // The engine's own rationale is used verbatim as the recommendation.
    expect(summary?.kind === "summary" && summary.bullets.join(" ")).toContain(ev.verdictWhy);
  });
});
