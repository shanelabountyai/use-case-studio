import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { useCases } from "@/db/schema";
import { evaluate, type UseCase } from "@/lib/engine";

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
  const payload = (await req.json()) as UseCase; // FABLE-BRIEF M3: validate with zod schema, don't trust the client
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
