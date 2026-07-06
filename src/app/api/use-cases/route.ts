import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { useCases } from "@/db/schema";
import { evaluate } from "@/lib/engine";
import { parseUseCase } from "@/lib/validation";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await db.select().from(useCases)
    .where(eq(useCases.userId, session.user.id))
    .orderBy(desc(useCases.updatedAt));
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const json = await req.json().catch(() => null);
  const parsed = parseUseCase(json); // reject structural garbage; clamp scores/weights
  if (!parsed.ok) return NextResponse.json({ error: "invalid payload", issues: parsed.issues }, { status: 400 });
  const payload = parsed.data;
  const ev = evaluate(payload); // verdict computed server-side from payload — never trust client's verdict
  const [row] = await db.insert(useCases).values({
    userId: session.user.id,
    name: payload.name ?? "",
    verdict: ev.verdict,
    composite: Math.round(ev.composite),
    quadrant: ev.quadrant,
    payload,
  }).returning();
  return NextResponse.json(row, { status: 201 });
}
