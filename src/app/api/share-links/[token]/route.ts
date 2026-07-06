import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { shareLinks, useCases } from "@/db/schema";

// DELETE /api/share-links/[token] — revoke (soft: sets revoked=true, so the
// public /s/[token] read stops resolving). Scoped to the caller's own cases.
export async function DELETE(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { token } = await params;

  // Confirm the link belongs to a case this user owns before revoking.
  const [owned] = await db
    .select({ token: shareLinks.token })
    .from(shareLinks)
    .innerJoin(useCases, eq(shareLinks.useCaseId, useCases.id))
    .where(and(eq(shareLinks.token, token), eq(useCases.userId, session.user.id)));
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db.update(shareLinks).set({ revoked: true }).where(eq(shareLinks.token, token));
  return NextResponse.json({ ok: true });
}
