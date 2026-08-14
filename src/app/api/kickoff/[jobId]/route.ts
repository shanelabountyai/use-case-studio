import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { buildKickoffPlans } from "@/db/schema";

export const runtime = "nodejs";

/* GET /api/kickoff/:jobId — owner-scoped poll. Returns status + result when
   ready. A non-owner (or unknown id) gets 404, never another user's job. */
export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const [row] = await db
    .select()
    .from(buildKickoffPlans)
    .where(and(eq(buildKickoffPlans.id, jobId), eq(buildKickoffPlans.userId, session.user.id)));
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    jobId: row.id,
    status: row.status,
    plan: row.plan,
    audit: row.audit,
    laneStatus: row.laneStatus,
    cost: row.cost,
    note: row.note,
    createdAt: row.createdAt,
    // Which model and prompt roster actually produced this — the caller can't
    // tell a bk-1 audit from a bk-2 one without it, and the rendered plan is
    // only interpretable alongside it.
    provenance: row.provenance,
    version: row.version,
  });
}
