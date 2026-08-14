import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOwnedJob, loadCasePayload } from "@/lib/kickoff/worker";
import { renderPrdPack } from "@/lib/kickoff/packaging";
import type { UseCase } from "@/lib/engine";
import type { IntegratedPlan, CriticAudit, Provenance } from "@/lib/kickoff/contracts";

export const runtime = "nodejs";

/* GET /api/kickoff/:jobId/prds.md — every milestone's PRD prompt in one file,
   plus the session starter that loads the shared context once.

   Unlike package.md this carries no client framing, so it is gated on
   completion rather than approval: it's a working document for the build team,
   and blocking it behind client sign-off would be the wrong gate. A partial
   run still yields usable prompts, and the pack says so in place of the audit. */
export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const row = await getOwnedJob(jobId, session.user.id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!row.plan)
    return NextResponse.json({ error: "no plan on this run — nothing to write PRDs from" }, { status: 409 });

  const uc = (await loadCasePayload(row.caseId)) as UseCase | null;
  if (!uc) return NextResponse.json({ error: "case not found" }, { status: 404 });

  const md = renderPrdPack({
    uc,
    plan: row.plan as IntegratedPlan,
    audit: row.audit as CriticAudit | null,
    provenance: row.provenance as Provenance,
    version: row.version,
    generatedOn: new Date().toISOString().slice(0, 10),
  });

  return new NextResponse(md, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="prd-pack.md"`,
    },
  });
}
