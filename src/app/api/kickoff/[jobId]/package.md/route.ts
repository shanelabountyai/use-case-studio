import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOwnedJob, loadCasePayload } from "@/lib/kickoff/worker";
import { renderKickoffPackage } from "@/lib/kickoff/packaging";
import type { UseCase } from "@/lib/engine";
import type { EngagementInputs } from "@/lib/deliverykit";
import type { IntegratedPlan, CriticAudit, Provenance } from "@/lib/kickoff/contracts";

export const runtime = "nodejs";

/* GET /api/kickoff/:jobId/package.md — the client-facing Build Kickoff Package.
   Same approval gate as export.md: this is the deliverable that leaves the
   building, so it requires an approved plan (P0.9). The engagement inputs ride
   on the case payload (DK-1), so the client's name comes from the case, not a
   query param a caller could spoof. */
export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const row = await getOwnedJob(jobId, session.user.id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.status !== "approved")
    return NextResponse.json({ error: "plan must be approved before export" }, { status: 403 });

  const uc = (await loadCasePayload(row.caseId)) as (UseCase & { engagement?: Partial<EngagementInputs> }) | null;
  if (!uc) return NextResponse.json({ error: "case not found" }, { status: 404 });

  const md = renderKickoffPackage({
    uc,
    plan: row.plan as IntegratedPlan,
    audit: row.audit as CriticAudit | null,
    provenance: row.provenance as Provenance,
    engagement: uc.engagement ?? {},
    version: row.version,
    generatedOn: new Date().toISOString().slice(0, 10),
  });

  return new NextResponse(md, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="build-kickoff-package.md"`,
    },
  });
}
