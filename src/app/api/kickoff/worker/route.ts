import { NextResponse } from "next/server";
import { kickoffKilled } from "@/lib/kickoff/flags";
import { claimNextJob, executeJob, finishJob, failInflightJobs, loadCasePayload } from "@/lib/kickoff/worker";
import { getProvider } from "@/lib/kickoff/provider";
import { evaluate, type UseCase } from "@/lib/engine";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel Pro ceiling — a single-shot 2-call run fits (BK-S2)

/* GET /api/kickoff/worker — the Vercel Cron drain (schedule in vercel.json).
   Claims one job per tick and runs it to a terminal state. Secured by
   CRON_SECRET: Vercel Cron sends it as a Bearer token; fail closed if unset so
   the endpoint is never open. Processes one job per invocation — the every-
   minute cron drains a backlog steadily and keeps each run inside maxDuration. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Kill switch: stop new work and fail anything in-flight cleanly.
  if (kickoffKilled()) {
    await failInflightJobs();
    return NextResponse.json({ paused: true }, { status: 200 });
  }

  const job = await claimNextJob();
  if (!job) return NextResponse.json({ claimed: 0 }, { status: 200 });

  const uc = await loadCasePayload(job.caseId);
  if (!uc) {
    await finishJob(job.id, {
      status: "failed",
      plan: null,
      audit: null,
      laneStatus: {},
      cost: null,
      note: "case not found",
    });
    return NextResponse.json({ jobId: job.id, status: "failed" }, { status: 200 });
  }

  // Re-derive the verdict again at run time (the case could have changed between
  // enqueue and execution); the planner must echo this.
  const { verdict } = evaluate(uc as UseCase);
  const startedAt = Date.now();
  const outcome = await executeJob(job.caseId, uc as UseCase, verdict, getProvider());
  await finishJob(job.id, outcome, Date.now() - startedAt); // latency telemetry (BK-6)
  return NextResponse.json({ jobId: job.id, status: outcome.status }, { status: 200 });
}
