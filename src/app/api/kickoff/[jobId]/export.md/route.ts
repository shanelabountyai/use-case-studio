import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOwnedJob } from "@/lib/kickoff/worker";
import { renderPlanMarkdown } from "@/lib/kickoff/export";
import type { IntegratedPlan, CriticAudit, Provenance } from "@/lib/kickoff/contracts";

export const runtime = "nodejs";

/* GET /api/kickoff/:jobId/export.md — owner-scoped Markdown export. 403s unless
   the plan is approved. The renderer binds the disclaimer + critic audit, so no
   export path emits a plan without them (P0.9, P0.13). */
export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const row = await getOwnedJob(jobId, session.user.id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.status !== "approved")
    return NextResponse.json({ error: "plan must be approved before export" }, { status: 403 });

  // Approved implies complete, which implies a plan + audit are present.
  const md = renderPlanMarkdown({
    plan: row.plan as IntegratedPlan,
    audit: row.audit as CriticAudit,
    provenance: row.provenance as Provenance,
    version: row.version,
  });
  return new NextResponse(md, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="build-kickoff-${jobId}.md"`,
    },
  });
}
