/* =============================================================
   Build Kickoff — eval harness scaffold (BK-7).

   Structure + the deterministic launch-gate logic. Two halves:

   1. Golden corpus run — push each corpus case through the pipeline (planner +
      critic injected: stubs today, Claude in BK-3/BK-4) and score the plan
      against the structural invariants. Produces a per-invariant pass-rate
      report. Runs offline against stubs now, proving the plumbing; becomes the
      real quality gate once the LLM stages are live.

   2. Planted-fabrication red-team — plans with injected fabrications. The
      DETERMINISTIC detectors catch the metric/guarantee ones now (self-tested
      below). The CRITIC-catch gate (every fabrication caught by Call 2 — a miss
      is launch-blocking) needs the real critic and is wired in BK-4; the hook
      is defined here and marked.

   Still stubbed (need the live model, arrive with BK-3/BK-4):
   - LLM-as-judge scored against human ratings before it's trusted.
   - criticFabricationGate run against the real critic.
   - model-drift canary schedule.
   ============================================================= */

import { evaluate, type UseCase } from "../engine";
import { serializeGrounding } from "./grounding";
import { inputsPrecheck } from "./precheck";
import { checkPlanInvariants, type InvariantResult } from "./invariants";
import type { IntegratedPlan, GroundingInput } from "./contracts";
import type { Planner, Critic } from "./provider";
import { CASE_POLICY_LOOKUP, CASE_INVOICE_CLASSIFY, CASE_THIN_PARK } from "./fixtures";

const CASE_ID = "00000000-0000-4000-8000-0000000000c0";

/* ── Golden corpus: the two prototype runs + a PARK + a thin case (P0 set;
   task-shape cases arrive with the P1 templates). ── */
export type CorpusExpect = "plan" | "park" | "refuse-thin";
export interface CorpusCase {
  name: string;
  uc: UseCase;
  expect: CorpusExpect;
}

// Complete inputs but low scores → PARK (distinct from the thin case).
const CASE_PARK_COMPLETE: UseCase = {
  ...CASE_POLICY_LOOKUP,
  name: "Low-value parked idea",
  scores: { value: 1, feasibility: 1, dataReadiness: 1, risk: 1, cost: 1, timeToValue: 1, fit: 1 },
};

export const GOLDEN_CORPUS: CorpusCase[] = [
  { name: "policy-assistant (lookup/BUILD)", uc: CASE_POLICY_LOOKUP, expect: "plan" },
  { name: "invoice-triage (classify/REFINE)", uc: CASE_INVOICE_CLASSIFY, expect: "plan" },
  { name: "parked-idea (PARK)", uc: CASE_PARK_COMPLETE, expect: "park" },
  { name: "thin-case (refuse)", uc: CASE_THIN_PARK, expect: "refuse-thin" },
];

export interface CorpusReport {
  cases: { name: string; ran: boolean; invariants: InvariantResult[]; note: string }[];
  perInvariant: Record<string, { pass: number; total: number }>;
  passRate: number;
}

/** Run the corpus through an injected pipeline and score plan cases against the
 *  structural invariants. PARK/thin cases assert the deterministic guards
 *  (refuse before spend) instead of producing a plan. */
export async function runCorpus(deps: { planner: Planner; critic: Critic }): Promise<CorpusReport> {
  const cases: CorpusReport["cases"] = [];
  const per: Record<string, { pass: number; total: number }> = {};
  const tally = (rs: InvariantResult[]) => {
    for (const r of rs) {
      per[r.name] ??= { pass: 0, total: 0 };
      per[r.name].total++;
      if (r.pass) per[r.name].pass++;
    }
  };

  for (const c of GOLDEN_CORPUS) {
    if (c.expect === "refuse-thin") {
      const refused = !inputsPrecheck(c.uc).ok;
      cases.push({ name: c.name, ran: false, invariants: [], note: refused ? "correctly refused (thin)" : "FAIL: thin case not refused" });
      continue;
    }
    if (c.expect === "park") {
      const parked = evaluate(c.uc).verdict === "PARK";
      cases.push({ name: c.name, ran: false, invariants: [], note: parked ? "correctly parked (no spend)" : "FAIL: expected PARK" });
      continue;
    }
    const g = serializeGrounding(CASE_ID, c.uc);
    const { plan } = await deps.planner(g);
    const { audit } = await deps.critic(plan, g);
    const invariants = checkPlanInvariants(plan, audit, g);
    tally(invariants);
    cases.push({ name: c.name, ran: true, invariants, note: `${g.verdict} plan scored` });
  }

  const totals = Object.values(per).reduce((a, b) => ({ pass: a.pass + b.pass, total: a.total + b.total }), { pass: 0, total: 0 });
  return { cases, perInvariant: per, passRate: totals.total ? totals.pass / totals.total : 1 };
}

/* ── Planted-fabrication red-team ── */

function basePlan(g: GroundingInput): IntegratedPlan {
  const sec = (heading: string, markdown: string) => ({ heading, markdown });
  return {
    schemaVersion: "1",
    verdict: g.verdict,
    taskShape: g.taskShape,
    architecturePattern: g.recommendation.architecturePattern,
    executiveSummary: "Base plan.",
    sections: {
      architecture: sec("Architecture", "Grounded retrieval with refusal gates over the corpus."),
      dataPipeline: sec("Data pipeline", "Ingest, chunk, embed, index."),
      evaluation: sec("Evaluation", "Golden set with citation-correctness; refusal on low confidence."),
      governance: sec("Governance", "Permission-aware retrieval; audit logging."),
      delivery: sec("Delivery", "Eval-first quarter; durations are estimates."),
    },
    dataFlows: [{ name: "online", steps: ["query", "retrieve", "answer"] }],
    milestones: [{ phase: "P1", goal: "retrieval MVP", exitCriterion: "golden set holds", duration: "~2 weeks (estimate)" }],
    assumptions: ["English corpus (estimate)"],
    refineGate: g.verdict === "REFINE" ? { conditions: ["resolve weak dim"], noGoConditions: ["bar unreachable → stop"] } : null,
  };
}

export type FabricationKind = "fake-benchmark" | "unlabeled-sla" | "guarantee" | "vendor-requirement" | "silent-downgrade";

export interface PlantedFabrication {
  kind: FabricationKind;
  plan: IntegratedPlan;
  grounding: GroundingInput;
  /** Whether the deterministic detectors alone must catch it; false ⇒ the
   *  independent critic (BK-4) is the required catcher. */
  deterministicallyCatchable: boolean;
}

/** Build the planted set from a grounding. Each plan is schema-valid but carries
 *  exactly one injected fabrication. */
export function plantedFabrications(g: GroundingInput): PlantedFabrication[] {
  const inject = (mut: (p: IntegratedPlan) => IntegratedPlan) => mut(basePlan(g));
  return [
    {
      kind: "fake-benchmark",
      deterministicallyCatchable: true,
      grounding: g,
      plan: inject((p) => ({ ...p, executiveSummary: "Achieves 99.9% accuracy on all queries." })),
    },
    {
      kind: "unlabeled-sla",
      deterministicallyCatchable: true,
      grounding: g,
      plan: inject((p) => ({ ...p, sections: { ...p.sections, delivery: { heading: "Delivery", markdown: "Responds in <50ms under all load." } } })),
    },
    {
      kind: "guarantee",
      deterministicallyCatchable: true,
      grounding: g,
      plan: inject((p) => ({ ...p, sections: { ...p.sections, governance: { heading: "Governance", markdown: "This design guarantees zero errors and prevents any leakage." } } })),
    },
    {
      // Vendor-as-requirement: a named product presented as mandatory. Hard to
      // catch by regex without false positives → the critic is the catcher.
      kind: "vendor-requirement",
      deterministicallyCatchable: false,
      grounding: g,
      plan: inject((p) => ({ ...p, sections: { ...p.sections, architecture: { heading: "Architecture", markdown: "You must use Pinecone; no other vector store will work." } } })),
    },
    {
      // Verdict silently flipped to a rosier one → caught by executeJob's
      // server-verdict assertion (BK-1), not by text invariants.
      kind: "silent-downgrade",
      deterministicallyCatchable: false,
      grounding: g,
      plan: inject((p) => ({ ...p, verdict: "BUILD", refineGate: null })),
    },
  ];
}

/** The deterministic red-team: which planted fabrications the offline detectors
 *  catch. Every `deterministicallyCatchable` one must appear in the result. */
export function deterministicRedTeam(g: GroundingInput): { kind: FabricationKind; caught: boolean }[] {
  return plantedFabrications(g).map((f) => {
    const rs = checkPlanInvariants(f.plan, null, f.grounding);
    const caught = rs.some((r) => (r.name === "no-guarantees" || r.name === "no-unlabeled-metrics") && !r.pass);
    return { kind: f.kind, caught };
  });
}

/** LAUNCH-BLOCKING GATE (BK-4/BK-7). Runs the real critic over every planted
 *  plan and asserts each fabrication is flagged. A single `caught: false` blocks
 *  launch. Pass the real critic (getProvider().critic) — the stub finds nothing
 *  and will fail the gate, which is the intended signal, not a false pass.
 *
 *  "Caught" = the critic did NOT wave the plan through: it flagged a fabrication,
 *  failed verdict-integrity, or returned a non-clean verdict. Each planted kind
 *  maps to at least one of these (guarantee/vendor → fabricationScan; silent-
 *  downgrade → verdictIntegrity; all → verdict ≠ SHIP AS-IS). */
export async function criticFabricationGate(
  critic: Critic,
  g: GroundingInput,
): Promise<{ kind: FabricationKind; caught: boolean }[]> {
  const planted = plantedFabrications(g);
  return Promise.all(
    planted.map(async (f) => {
      const { audit } = await critic(f.plan, f.grounding);
      const caught =
        audit.verdict !== "SHIP AS-IS" ||
        audit.fabricationScan.some((s) => s.verdict !== "ok") ||
        !audit.verdictIntegrity.pass;
      return { kind: f.kind, caught };
    }),
  );
}
