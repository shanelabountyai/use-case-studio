import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { useCases } from "@/db/schema";
import { evaluate, type UseCase } from "@/lib/engine";
import { kickoffEnabled } from "@/lib/kickoff/flags";
import { inputsPrecheck, needsPiiConfirm, sensitivityLabel } from "@/lib/kickoff/precheck";
import { caseVersionHash, parkNote } from "@/lib/kickoff/grounding";
import { createJob } from "@/lib/kickoff/worker";
import { PROMPT_ROSTER_VERSION } from "@/lib/kickoff/provider";
import type { Provenance } from "@/lib/kickoff/contracts";

export const runtime = "nodejs"; // Neon HTTP driver + node:crypto (caseVersionHash)

const owned = (id: string, userId: string) => and(eq(useCases.id, id), eq(useCases.userId, userId));

/* POST /api/kickoff  { caseId, confirmSendToProvider? }
   Owner-scoped trigger. Re-derives the verdict server-side, runs the
   deterministic pre-check, routes by verdict, and (BUILD only) enqueues a job
   behind the PII confirm gate. Nothing here spends. */
export async function POST(req: Request) {
  if (!kickoffEnabled())
    return NextResponse.json({ error: "Build Kickoff is not available." }, { status: 503 });

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const caseId = body?.caseId;
  if (typeof caseId !== "string")
    return NextResponse.json({ error: "caseId required" }, { status: 400 });

  const [caseRow] = await db.select().from(useCases).where(owned(caseId, session.user.id));
  if (!caseRow) return NextResponse.json({ error: "not found" }, { status: 404 });
  const uc = caseRow.payload as UseCase;

  // Verdict is ALWAYS re-derived from the payload — never the stored/denormalized
  // column and never anything a client sent.
  const { verdict } = evaluate(uc);

  // Gate 1: inputs completeness — refuse a thin case before any routing/spend.
  const pc = inputsPrecheck(uc);
  if (!pc.ok)
    return NextResponse.json(
      { error: "incomplete inputs", missing: pc.missing },
      { status: 422 },
    );

  // Verdict routing.
  if (verdict === "PARK")
    // No pipeline, no spend — a deterministic "what would move this to BUILD" note.
    // ponytail: PARK note is returned, not persisted; add a row if PARK history/
    // telemetry is wanted (BK-6).
    return NextResponse.json({ verdict, note: parkNote(uc) }, { status: 200 });

  if (verdict === "REFINE")
    return NextResponse.json({ error: "REFINE kickoff lands in P1" }, { status: 501 });

  // BUILD path. Gate 2: PII confirm before the case leaves for the provider.
  if (needsPiiConfirm(uc) && body?.confirmSendToProvider !== true)
    return NextResponse.json(
      {
        error: "confirmation required",
        reason: `This case is ${sensitivityLabel(uc)}. Confirm sending it to the model provider.`,
        needs: "confirmSendToProvider",
      },
      { status: 409 },
    );

  const hash = caseVersionHash(uc);
  const provenance: Provenance = {
    caseVersion: hash,
    promptRosterVersion: PROMPT_ROSTER_VERSION,
    model: "stub", // real model recorded when BK-3 wires the provider
    modelParams: {},
    verdictAtGeneration: verdict,
    engineOutputsHash: hash,
  };
  const job = await createJob({ caseId, userId: session.user.id, provenance });
  return NextResponse.json({ jobId: job.id, status: "queued" }, { status: 202 });
}
