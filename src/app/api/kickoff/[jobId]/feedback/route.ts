import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { recordFeedback, type FeedbackKind } from "@/lib/kickoff/worker";

export const runtime = "nodejs";

const KINDS: FeedbackKind[] = ["gap-real", "fabrication", "usable"];

/* POST /api/kickoff/:jobId/feedback  { kind, ref?, value }
   Owner-scoped inline feedback — "was this gap real?", "flag a fabrication",
   usable/not. Seeds the eval corpus (BK-6 / P0.14). */
export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const body = await req.json().catch(() => null);
  if (!body || !KINDS.includes(body.kind) || typeof body.value !== "string")
    return NextResponse.json({ error: "kind (gap-real|fabrication|usable) and value required" }, { status: 400 });

  const ok = await recordFeedback({
    jobId,
    userId: session.user.id,
    kind: body.kind,
    ref: typeof body.ref === "string" ? body.ref : undefined,
    value: body.value,
  });
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
