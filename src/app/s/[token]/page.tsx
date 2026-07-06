import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { shareLinks, useCases } from "@/db/schema";
import { evaluate, type UseCase } from "@/lib/engine";

/** Public, read-only Showcase brief. No auth — access is the unguessable token.
 *  FABLE-BRIEF M3: render the full Showcase brief from reference/ai-use-case-studio.jsx here. */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [link] = await db.select().from(shareLinks)
    .where(and(eq(shareLinks.token, token), eq(shareLinks.revoked, false)));
  if (!link) return <main className="p-8">This link doesn&apos;t exist or was revoked.</main>;
  const [row] = await db.select().from(useCases).where(eq(useCases.id, link.useCaseId));
  if (!row) return <main className="p-8">Case not found.</main>;
  const ev = evaluate(row.payload as UseCase);
  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">{row.name || "Untitled use case"}</h1>
      <p className="mt-2">Verdict: <strong>{ev.verdict}</strong> — composite {ev.composite.toFixed(0)}/100 · {ev.quadrant}</p>
      <p className="mt-2 text-sm">{ev.verdictWhy}</p>
      <p className="mt-6 text-xs opacity-60">Placeholder — the full branded Showcase brief is ported in M3.</p>
    </main>
  );
}
