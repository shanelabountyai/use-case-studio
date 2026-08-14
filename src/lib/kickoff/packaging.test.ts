import { describe, it, expect } from "vitest";
import { renderKickoffPackage } from "./packaging";
import { stubPlanner, stubCritic } from "./provider";
import { serializeGrounding } from "./grounding";
import { CASE_POLICY_LOOKUP } from "./fixtures";
import type { Provenance } from "./contracts";

const CASE_ID = "00000000-0000-0000-0000-000000000000";
const g = serializeGrounding(CASE_ID, CASE_POLICY_LOOKUP);
const { plan } = await stubPlanner(g);
const { audit } = await stubCritic(plan, g);

const provenance: Provenance = {
  caseVersion: "abc123",
  promptRosterVersion: "bk-2-claude",
  model: "claude-opus-5",
  modelParams: { effort: "medium" },
  verdictAtGeneration: "BUILD",
  engineOutputsHash: "abc123",
};

const render = (over: Partial<Parameters<typeof renderKickoffPackage>[0]> = {}) =>
  renderKickoffPackage({
    uc: CASE_POLICY_LOOKUP,
    plan,
    audit,
    provenance,
    engagement: { client: "Acme Corp", practitioner: "Lab Intelligence, LLC", sponsor: "VP Ops" },
    version: 1,
    generatedOn: "2026-08-14",
    ...over,
  });

describe("renderKickoffPackage", () => {
  it("carries the client framing the internal export lacks", () => {
    const md = render();
    expect(md).toContain("Acme Corp");
    expect(md).toContain("VP Ops");
    expect(md).toContain("Lab Intelligence, LLC");
  });

  it("emits all eight numbered sections", () => {
    const md = render();
    for (const h of ["## 1. Decision", "## 2. Architecture", "## 3. Workflows", "## 4. Delivery plan",
      "## 5. Requirements", "## 6. Evaluation", "## 7. Governance", "## 8. Assumptions"])
      expect(md).toContain(h);
  });

  it("renders a mermaid diagram per data flow", () => {
    const md = render();
    const diagrams = md.match(/```mermaid/g) ?? [];
    expect(diagrams.length).toBe(plan.dataFlows.length);
    expect(md).toContain("flowchart TD");
  });

  it("gives every milestone a PRD starter carrying its own exit criterion", () => {
    const md = render();
    for (const m of plan.milestones) {
      expect(md).toContain(m.phase);
      expect(md).toContain(m.exitCriterion);
    }
    expect((md.match(/PRD starter prompt/g) ?? []).length).toBe(plan.milestones.length);
  });

  it("always binds the disclaimer and the provenance", () => {
    const md = render();
    expect(md).toContain("Decision-support, not a guarantee");
    expect(md).toContain("claude-opus-5");
    expect(md).toContain("bk-2-claude");
  });

  /* A partial run has a plan but no audit. Silence would read as "nothing was
     wrong" — the opposite of the truth. */
  it("says plainly when no audit is attached", () => {
    const md = render({ audit: null });
    expect(md).toContain("No independent audit is attached");
    expect(md).toContain("Treat it as a draft");
  });

  it("escapes quotes and newlines that would break the mermaid block", () => {
    const messy = {
      ...plan,
      dataFlows: [{ name: "Messy", steps: ['a "quoted" step', "line\nbreak"] }],
    };
    const md = render({ plan: messy });
    const block = md.slice(md.indexOf("```mermaid"), md.indexOf("```", md.indexOf("```mermaid") + 3));
    expect(block).not.toContain('"quoted"');
    expect(block.split("\n").filter((l) => l.includes("n0_1")).length).toBeGreaterThan(0);
  });
});
