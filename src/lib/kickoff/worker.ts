/* Build Kickoff worker (BK-1): the job state machine + DB queue operations.

   executeJob is the pure-ish orchestrator (LLM stages injected, so it unit-tests
   without a provider or a DB). The DB ops implement the BK-S2 mechanism: a
   compare-and-swap claim over the neon-http driver (no transaction needed) with
   a lease so a dead worker's row is reclaimable.

   Partial-lane contract (P0.10): any stage failure marks its lane and yields
   status=partial — never a silent "complete" over a missing lane. A plan with
   no completed critic audit is partial, hence non-approvable downstream (BK-5). */

import { and, asc, eq, lt, max, or } from "drizzle-orm";
import { db } from "@/db";
import { buildKickoffPlans, kickoffFeedback, useCases } from "@/db/schema";
import type { UseCase } from "../engine";
import { serializeGrounding } from "./grounding";
import type { IntegratedPlan, CriticAudit, LaneStatus, Provenance } from "./contracts";
import { stubPlanner, stubCritic, type Planner, type Critic } from "./provider";
import { getLimits, type KickoffLimits } from "./limits";
import { priceUsd, kickoffModel } from "./pricing";

const LEASE_MS = 5 * 60 * 1000; // 5 min — comfortably over a single-shot run on Vercel Pro (300s)
const MAX_ATTEMPTS = 3;

/** Resolve to a sentinel if `p` doesn't settle within ms. ponytail: the race
 *  stops us waiting, it does not hard-abort the in-flight call — BK-3/BK-4 pass
 *  an AbortSignal to actually cancel the fetch. Good enough to bound the worker. */
function raceTimeout<T>(p: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const t = new Promise<T>((res) => {
    timer = setTimeout(() => res(onTimeout), ms);
  });
  return Promise.race([p.finally(() => clearTimeout(timer)), t]);
}

export interface JobOutcome {
  status: "complete" | "partial" | "failed";
  plan: IntegratedPlan | null;
  audit: CriticAudit | null;
  laneStatus: LaneStatus;
  cost: { inputTokens: number; outputTokens: number; usd: number } | null;
  note: string | null;
}

/** Run the two-stage pipeline for one job. Deterministic control flow; the two
 *  LLM stages are injected (stubs in P0, Claude in BK-3/BK-4). Bounded by a
 *  per-run token cap and wall-clock timeout (BK-6): breaching either aborts to a
 *  labeled partial rather than running away. */
export async function executeJob(
  caseId: string,
  uc: UseCase,
  serverVerdict: string,
  deps: { planner: Planner; critic: Critic } = { planner: stubPlanner, critic: stubCritic },
  limits: KickoffLimits = getLimits(),
): Promise<JobOutcome> {
  const timedOut: JobOutcome = {
    status: "partial", plan: null, audit: null,
    laneStatus: { planner: "failed", critic: "skipped" }, cost: null,
    note: `run exceeded ${limits.timeoutMs}ms timeout`,
  };
  return raceTimeout(runPipeline(caseId, uc, serverVerdict, deps, limits), limits.timeoutMs, timedOut);
}

async function runPipeline(
  caseId: string,
  uc: UseCase,
  serverVerdict: string,
  deps: { planner: Planner; critic: Critic },
  limits: KickoffLimits,
): Promise<JobOutcome> {
  const laneStatus: LaneStatus = { planner: "skipped", critic: "skipped" };
  const g = serializeGrounding(caseId, uc);
  let inputTokens = 0;
  let outputTokens = 0;
  const overCap = () => inputTokens + outputTokens > limits.tokenCap;

  // ── Call 1: planner ──
  let plan: IntegratedPlan;
  try {
    const r = await deps.planner(g);
    plan = r.plan;
    inputTokens += r.inputTokens;
    outputTokens += r.outputTokens;
    laneStatus.planner = "ok";
  } catch {
    laneStatus.planner = "failed";
    return { status: "partial", plan: null, audit: null, laneStatus, cost: null, note: "planner stage failed" };
  }

  // Integrity: the planner echoes a verdict; the server's re-derived verdict wins.
  if (plan.verdict !== serverVerdict) {
    laneStatus.planner = "failed";
    return { status: "partial", plan, audit: null, laneStatus, cost: null, note: `verdict mismatch: plan=${plan.verdict} server=${serverVerdict}` };
  }

  // Token cap: stop before the critic call if the planner already blew the budget.
  if (overCap()) {
    laneStatus.critic = "skipped";
    return { status: "partial", plan, audit: null, laneStatus, cost: { inputTokens, outputTokens, usd: priceUsd(kickoffModel(), inputTokens, outputTokens) }, note: `token cap exceeded (${inputTokens + outputTokens}/${limits.tokenCap})` };
  }

  // ── Call 2: critic (independent — sees only plan + grounding) ──
  try {
    const r = await deps.critic(plan, g);
    inputTokens += r.inputTokens;
    outputTokens += r.outputTokens;
    laneStatus.critic = "ok";
    if (overCap())
      return { status: "partial", plan, audit: r.audit, laneStatus, cost: { inputTokens, outputTokens, usd: priceUsd(kickoffModel(), inputTokens, outputTokens) }, note: `token cap exceeded (${inputTokens + outputTokens}/${limits.tokenCap})` };
    return {
      status: "complete",
      plan,
      audit: r.audit,
      laneStatus,
      cost: { inputTokens, outputTokens, usd: priceUsd(kickoffModel(), inputTokens, outputTokens) },
      note: null,
    };
  } catch {
    laneStatus.critic = "failed";
    // A plan without an audit is non-approvable → partial, never complete.
    return { status: "partial", plan, audit: null, laneStatus, cost: { inputTokens, outputTokens, usd: priceUsd(kickoffModel(), inputTokens, outputTokens) }, note: "critic stage failed" };
  }
}

/* ─────────────────────── DB queue operations ─────────────────────── */

export async function createJob(input: {
  caseId: string;
  userId: string;
  provenance: Provenance;
}): Promise<{ id: string }> {
  // Per-case monotonic version (BK-5). One plan/case in P0; re-runs (P1) increment.
  const [{ v } = { v: null }] = await db
    .select({ v: max(buildKickoffPlans.version) })
    .from(buildKickoffPlans)
    .where(eq(buildKickoffPlans.caseId, input.caseId));
  const [row] = await db
    .insert(buildKickoffPlans)
    .values({
      caseId: input.caseId,
      userId: input.userId,
      version: (v ?? 0) + 1,
      status: "queued",
      laneStatus: {},
      provenance: input.provenance,
    })
    .returning({ id: buildKickoffPlans.id });
  return row;
}

/** Owner-scoped fetch of a full job row (approve/export/poll). */
export async function getOwnedJob(jobId: string, userId: string) {
  const [row] = await db
    .select()
    .from(buildKickoffPlans)
    .where(and(eq(buildKickoffPlans.id, jobId), eq(buildKickoffPlans.userId, userId)));
  return row ?? null;
}

export type ApproveResult = "approved" | "not-found" | "not-approvable";

/** Draft→approve transition. Only a `complete` plan (plan + attached audit) is
 *  approvable; partial/failed/queued/running are refused (P0.7, P0.10). */
export async function approveJob(jobId: string, userId: string): Promise<ApproveResult> {
  const row = await getOwnedJob(jobId, userId);
  if (!row) return "not-found";
  if (row.status !== "complete") return "not-approvable";
  await db
    .update(buildKickoffPlans)
    .set({ status: "approved", approvedAt: new Date() })
    .where(and(eq(buildKickoffPlans.id, jobId), eq(buildKickoffPlans.userId, userId)));
  return "approved";
}

/** Compare-and-swap claim: pick the oldest queued (or dead-lease) job, then
 *  conditionally flip it to running. If another worker won the race the guarded
 *  update matches 0 rows and we return null — the next cron tick retries. */
export async function claimNextJob(): Promise<typeof buildKickoffPlans.$inferSelect | null> {
  const now = new Date();
  const claimable = or(
    eq(buildKickoffPlans.status, "queued"),
    and(eq(buildKickoffPlans.status, "running"), lt(buildKickoffPlans.leaseUntil, now)),
  );
  const [cand] = await db
    .select({ id: buildKickoffPlans.id, attempts: buildKickoffPlans.attempts })
    .from(buildKickoffPlans)
    .where(claimable)
    .orderBy(asc(buildKickoffPlans.createdAt))
    .limit(1);
  if (!cand) return null;

  if (cand.attempts >= MAX_ATTEMPTS) {
    await db
      .update(buildKickoffPlans)
      .set({ status: "failed", note: `exceeded ${MAX_ATTEMPTS} attempts` })
      .where(eq(buildKickoffPlans.id, cand.id));
    return null;
  }

  const [claimed] = await db
    .update(buildKickoffPlans)
    .set({ status: "running", attempts: cand.attempts + 1, leaseUntil: new Date(Date.now() + LEASE_MS) })
    .where(and(eq(buildKickoffPlans.id, cand.id), claimable)) // guard: still claimable
    .returning();
  return claimed ?? null;
}

export async function finishJob(id: string, outcome: JobOutcome, latencyMs?: number): Promise<void> {
  await db
    .update(buildKickoffPlans)
    .set({
      status: outcome.status,
      plan: outcome.plan,
      audit: outcome.audit,
      laneStatus: outcome.laneStatus,
      cost: outcome.cost,
      latencyMs: latencyMs ?? null,
      note: outcome.note,
      leaseUntil: null,
    })
    .where(eq(buildKickoffPlans.id, id));
}

export type FeedbackKind = "gap-real" | "fabrication" | "usable";

/** Persist one inline feedback signal, owner-scoped (the caller must own the
 *  job). Returns false if the job isn't the user's. Seeds the eval corpus. */
export async function recordFeedback(input: {
  jobId: string;
  userId: string;
  kind: FeedbackKind;
  ref?: string;
  value: string;
}): Promise<boolean> {
  const owns = await getOwnedJob(input.jobId, input.userId);
  if (!owns) return false;
  await db.insert(kickoffFeedback).values({
    jobId: input.jobId,
    userId: input.userId,
    kind: input.kind,
    ref: input.ref ?? null,
    value: input.value,
  });
  return true;
}

/** Kill switch: fail any in-flight (queued/running) job cleanly (BK-6 surfaces
 *  the paused state). Called by the worker when the switch is flipped. */
export async function failInflightJobs(): Promise<void> {
  await db
    .update(buildKickoffPlans)
    .set({ status: "failed", note: "Build Kickoff paused (kill switch)", leaseUntil: null })
    .where(or(eq(buildKickoffPlans.status, "queued"), eq(buildKickoffPlans.status, "running")));
}

/** Load a job's case payload (used by the worker route). */
export async function loadCasePayload(caseId: string): Promise<UseCase | null> {
  const [row] = await db.select().from(useCases).where(eq(useCases.id, caseId));
  return row ? (row.payload as UseCase) : null;
}
