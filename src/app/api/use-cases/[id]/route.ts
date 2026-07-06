import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { useCases } from "@/db/schema";
import { evaluate } from "@/lib/engine";
import { parseUseCase } from "@/lib/validation";

// Every query is scoped by (id AND userId): a user can never touch another user's rows.
const owned = (id: string, userId: string) => and(eq(useCases.id, id), eq(useCases.userId, userId));

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const [row] = await db.select().from(useCases).where(owned(id, session.user.id));
  return row ? NextResponse.json(row) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = parseUseCase(json); // reject structural garbage; clamp scores/weights
  if (!parsed.ok) return NextResponse.json({ error: "invalid payload", issues: parsed.issues }, { status: 400 });
  const payload = parsed.data;
  const ev = evaluate(payload);
  const [row] = await db.update(useCases).set({
    name: payload.name ?? "",
    verdict: ev.verdict,
    composite: Math.round(ev.composite),
    quadrant: ev.quadrant,
    payload,
    updatedAt: new Date(),
  }).where(owned(id, session.user.id)).returning();
  return row ? NextResponse.json(row) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const rows = await db.delete(useCases).where(owned(id, session.user.id)).returning({ id: useCases.id });
  return rows.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not found" }, { status: 404 });
}
