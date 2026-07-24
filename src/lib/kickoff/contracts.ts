/* =============================================================
   Build Kickoff — inter-stage data contracts (BK-0).

   The four Zod schemas that span the async pipeline, verbatim from
   PRD v2 → Data Contracts. These are the ticketable boundaries:

     serializer ──GroundingInput──▶ Call 1 (planner)
                                      │
                                 IntegratedPlan
                                      │
                  Call 2 (critic) ◀───┘   (plan + grounding only)
                                      │
                                 CriticAudit
                                      ▼
                              BuildKickoffPlan  (persisted record)

   No LLM code, no I/O — pure schemas + inferred types, importable
   app-wide with no dependency on engine.ts (the UseCase payload rides
   as an opaque record here, matching the serializer's boundary).
   ============================================================= */

import { z } from "zod";

export const Verdict = z.enum(["BUILD", "REFINE", "PARK"]);
export const TaskShape = z.enum(["lookup", "classify", "actions", "process", "generate", ""]);

/* ── Grounding: deterministic serializer output → Call 1 input ── */
export const GroundingInput = z.object({
  caseId: z.string().uuid(),
  caseVersion: z.string(), // hash of the use_case payload at generation time
  name: z.string(),
  verdict: Verdict, // re-derived server-side; agents must not override
  composite: z.number(),
  quadrant: z.string(),
  taskShape: TaskShape,
  acceptanceBar: z.string(), // pulled out explicitly — the spine
  useCase: z.record(z.string(), z.unknown()), // full UseCase (engine shape), verbatim
  evaluation: z.object({
    flags: z.array(z.object({ sev: z.enum(["critical", "warn"]), text: z.string() })),
    contribs: z.array(
      z.object({ key: z.string(), label: z.string(), score: z.number(), weight: z.number() }),
    ),
  }),
  recommendation: z.object({
    // engine output the agents EXPAND, not replace
    architecturePattern: z.string(), // recArchitecture(uc).pattern — pinned
    architectureWhy: z.string(),
    hitl: z.string(),
    dataAccess: z.array(z.string()),
    testingLayers: z.array(z.object({ name: z.string(), body: z.string() })),
    crisp: z.array(z.object({ phase: z.string(), actions: z.array(z.string()) })),
  }),
});
export type GroundingInput = z.infer<typeof GroundingInput>;

/* ── Call 1 output: the integrated plan ── */
const DataFlow = z.object({ name: z.string(), steps: z.array(z.string()).min(1) });
const Milestone = z.object({
  phase: z.string(),
  duration: z.string().optional(), // MUST be a labeled estimate if present
  goal: z.string(),
  exitCriterion: z.string(),
  ownerOfRisk: z.string().optional(),
});
const Section = z.object({ heading: z.string(), markdown: z.string().min(1) });

export const IntegratedPlan = z
  .object({
    schemaVersion: z.literal("1"),
    verdict: Verdict, // echoed; server asserts == GroundingInput.verdict
    taskShape: TaskShape,
    architecturePattern: z.string(), // asserted to match recommendation family
    executiveSummary: z.string().min(1),
    sections: z.object({
      architecture: Section,
      dataPipeline: Section,
      evaluation: Section,
      governance: Section,
      delivery: Section,
      integrationNotes: Section.optional(),
    }),
    dataFlows: z.array(DataFlow).min(1),
    milestones: z.array(Milestone).min(1),
    assumptions: z.array(z.string()), // estimates/assumptions surfaced explicitly
    refineGate: z
      .object({
        // REQUIRED iff verdict === "REFINE"
        conditions: z.array(z.string()).min(1),
        noGoConditions: z.array(z.string()).min(1),
      })
      .nullable(),
  })
  .superRefine((p, ctx) => {
    if (p.verdict === "REFINE" && !p.refineGate)
      ctx.addIssue({ code: "custom", message: "REFINE plans require a refineGate with ≥1 no-go" });
    if (p.verdict !== "REFINE" && p.refineGate)
      ctx.addIssue({ code: "custom", message: "refineGate only valid for REFINE" });
  });
export type IntegratedPlan = z.infer<typeof IntegratedPlan>;

/* ── Call 2 output: the critic audit ── */
const Severity = z.enum(["ok", "must-label", "must-remove"]);
export const CriticAudit = z.object({
  schemaVersion: z.literal("1"),
  fabricationScan: z.array(z.object({ quote: z.string(), verdict: Severity })),
  consistencyIssues: z.array(z.string()), // [] = none found
  verdictIntegrity: z.object({ pass: z.boolean(), note: z.string() }),
  gaps: z.array(z.object({ title: z.string(), detail: z.string() })).min(1),
  acceptanceBarSpine: z.object({ isSpine: z.boolean(), evidence: z.string() }),
  overclaims: z.array(z.string()),
  verdict: z.enum(["SHIP AS-IS", "SHIP WITH FIXES", "NEEDS REWORK"]),
  topFixes: z.array(z.string()).max(3),
});
export type CriticAudit = z.infer<typeof CriticAudit>;

/* ── Persisted record ── */
export const LaneStatus = z.record(z.string(), z.enum(["ok", "failed", "skipped"]));
export type LaneStatus = z.infer<typeof LaneStatus>;

export const Provenance = z.object({
  caseVersion: z.string(),
  promptRosterVersion: z.string(), // bumped on any prompt edit
  model: z.string(),
  modelParams: z.record(z.string(), z.unknown()),
  verdictAtGeneration: Verdict,
  engineOutputsHash: z.string(),
});
export type Provenance = z.infer<typeof Provenance>;

export const Cost = z.object({ inputTokens: z.number(), outputTokens: z.number(), usd: z.number() });
export type Cost = z.infer<typeof Cost>;

export const KickoffStatus = z.enum([
  "queued",
  "running",
  "partial",
  "complete",
  "failed",
  "approved",
  "killed",
]);
export type KickoffStatus = z.infer<typeof KickoffStatus>;

export const BuildKickoffPlan = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  ownerId: z.string(),
  version: z.number().int(), // per case, monotonic
  status: KickoffStatus,
  plan: IntegratedPlan.nullable(),
  audit: CriticAudit.nullable(),
  laneStatus: LaneStatus, // partial-result contract
  provenance: Provenance,
  cost: Cost.nullable(),
  approvedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type BuildKickoffPlan = z.infer<typeof BuildKickoffPlan>;
