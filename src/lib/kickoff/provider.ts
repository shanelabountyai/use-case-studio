/* The LLM provider boundary (BK-1). The pipeline is defined against these two
   function types; BK-3 (planner) and BK-4 (critic) drop in Claude-backed
   implementations behind the SAME signatures — nothing upstream changes.

   For P0 plumbing the exported implementations are STUBS: schema-valid, offline,
   zero-cost, so the async lifecycle (queue → run → persist → poll) and every
   deterministic guard can be built and tested before a single real call. */

import type { GroundingInput, IntegratedPlan, CriticAudit } from "./contracts";

export type Planner = (g: GroundingInput) => Promise<{ plan: IntegratedPlan; inputTokens: number; outputTokens: number }>;
export type Critic = (plan: IntegratedPlan, g: GroundingInput) => Promise<{ audit: CriticAudit; inputTokens: number; outputTokens: number }>;

// Bumped on any planner/critic prompt edit (BK-3 owns the real roster). Pinned
// into provenance so a plan is traceable to the prompts that produced it.
export const PROMPT_ROSTER_VERSION = "bk-p0-stub";

const stubSection = (heading: string) => ({ heading, markdown: `_(stub)_ ${heading} section.` });

/** Offline planner stub — echoes the server verdict, emits a schema-valid plan. */
export const stubPlanner: Planner = async (g) => ({
  inputTokens: 0,
  outputTokens: 0,
  plan: {
    schemaVersion: "1",
    verdict: g.verdict, // MUST echo the server-derived verdict
    taskShape: g.taskShape,
    architecturePattern: g.recommendation.architecturePattern, // pinned from grounding
    executiveSummary: `Stub plan for ${g.name || "case"}.`,
    sections: {
      architecture: stubSection("Architecture"),
      dataPipeline: stubSection("Data pipeline"),
      evaluation: stubSection("Evaluation"),
      governance: stubSection("Governance"),
      delivery: stubSection("Delivery"),
    },
    dataFlows: [{ name: "stub flow", steps: ["ingest", "process"] }],
    milestones: [{ phase: "P1", goal: "stub milestone", exitCriterion: "acceptance bar met" }],
    assumptions: ["stub output (no LLM ran)"],
    refineGate:
      g.verdict === "REFINE"
        ? { conditions: ["resolve weakest dimension"], noGoConditions: ["bar unreachable → stop"] }
        : null,
  },
});

/** Offline critic stub — schema-valid audit, no findings of substance. */
export const stubCritic: Critic = async () => ({
  inputTokens: 0,
  outputTokens: 0,
  audit: {
    schemaVersion: "1",
    fabricationScan: [],
    consistencyIssues: [],
    verdictIntegrity: { pass: true, note: "stub" },
    gaps: [{ title: "stub", detail: "no critic ran (P0 plumbing stub)" }],
    acceptanceBarSpine: { isSpine: true, evidence: "stub" },
    overclaims: [],
    verdict: "SHIP WITH FIXES",
    topFixes: ["replace stub with the BK-3/BK-4 Claude pipeline"],
  },
});
