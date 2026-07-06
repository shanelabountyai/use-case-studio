import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { shareLinks, useCases } from "@/db/schema";
import { generateShareToken } from "@/lib/sharing";

/* Authenticated share-link management. Links are scoped to cases the caller
   owns — a link can only be created for, listed against, or (in [token]) revoked
   on a use_case whose user_id matches the session. The public read lives at
   /s/[token] and touches none of this auth surface. */

// GET /api/share-links[?useCaseId=...] — the caller's links, newest first.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const useCaseId = new URL(req.url).searchParams.get("useCaseId");
  const where = useCaseId
    ? and(eq(useCases.userId, session.user.id), eq(shareLinks.useCaseId, useCaseId))
    : eq(useCases.userId, session.user.id);
  const rows = await db
    .select({ token: shareLinks.token, useCaseId: shareLinks.useCaseId, revoked: shareLinks.revoked, createdAt: shareLinks.createdAt })
    .from(shareLinks)
    .innerJoin(useCases, eq(shareLinks.useCaseId, useCases.id))
    .where(where)
    .orderBy(desc(shareLinks.createdAt));
  return NextResponse.json(rows);
}

// POST /api/share-links { useCaseId } — mint a link for a case the caller owns.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const useCaseId = body?.useCaseId;
  if (typeof useCaseId !== "string" || !useCaseId) return NextResponse.json({ error: "useCaseId required" }, { status: 400 });

  // Ownership check: never mint a link for someone else's case.
  const [owned] = await db.select({ id: useCases.id }).from(useCases)
    .where(and(eq(useCases.id, useCaseId), eq(useCases.userId, session.user.id)));
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });

  const token = generateShareToken();
  const [row] = await db.insert(shareLinks).values({ token, useCaseId }).returning();
  return NextResponse.json(row, { status: 201 });
}
