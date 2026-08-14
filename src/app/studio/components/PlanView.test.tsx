// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { stubPlanner, stubCritic } from "@/lib/kickoff/provider";
import { serializeGrounding } from "@/lib/kickoff/grounding";
import { CASE_POLICY_LOOKUP } from "@/lib/kickoff/fixtures";
import { PlanView } from "./PlanView";

// Build the fixture from the stubs so it stays schema-valid as contracts move.
const g = serializeGrounding("00000000-0000-0000-0000-000000000000", CASE_POLICY_LOOKUP);
const { plan } = await stubPlanner(g);
const { audit } = await stubCritic(plan, g);

afterEach(cleanup);

describe("PlanView", () => {
  it("renders the summary, every section, milestones and assumptions", () => {
    render(<PlanView plan={plan} audit={audit} />);
    expect(screen.getByText(/Executive summary/i)).toBeTruthy();
    // getAllBy: "architecture" also appears in the pattern line above the sections.
    for (const label of ["ARCHITECTURE", "DATA PIPELINE", "EVALUATION", "GOVERNANCE", "DELIVERY"])
      expect(screen.getAllByText(new RegExp(label, "i")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Milestones/i)).toBeTruthy();
    expect(screen.getByText(/Assumptions/i)).toBeTruthy();
  });

  it("leads with the critic verdict — a plan is only as good as its audit", () => {
    render(<PlanView plan={plan} audit={audit} />);
    expect(screen.getByText(new RegExp(`Critic audit — ${audit.verdict}`, "i"))).toBeTruthy();
  });

  it("renders a partial run's plan even with no audit", () => {
    render(<PlanView plan={plan} audit={null} />);
    expect(screen.getByText(/Executive summary/i)).toBeTruthy();
    expect(screen.queryByText(/Critic audit/i)).toBeNull();
  });
});
