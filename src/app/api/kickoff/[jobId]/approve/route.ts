import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { approveJob } from "@/lib/kickoff/worker";

export const runtime = "nodejs";

/* POST /api/kickoff/:jobId/approve — owner-scoped draft→approve gate. Only a
   completed plan (with its attached critic audit) can be approved; a partial or
   otherwise non-complete plan is refused with 409. Export is blocked until this
   succeeds. */
export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const result = await approveJob(jobId, session.user.id);
  if (result === "not-found") return NextResponse.json({ error: "not found" }, { status: 404 });
  if (result === "not-approvable")
    return NextResponse.json(
      { error: "only a completed plan can be approved" },
      { status: 409 },
    );
  return NextResponse.json({ ok: true, status: "approved" });
}
