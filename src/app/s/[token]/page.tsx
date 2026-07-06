import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { shareLinks, useCases } from "@/db/schema";
import { evaluate, recArchitecture, type UseCase } from "@/lib/engine";
import { ShowcaseBrief } from "@/app/studio/components/ShowcaseBrief";

/* Public, read-only Showcase brief. No auth — access is the unguessable token,
   and a revoked link (revoked=true) simply won't match, so a revoked or
   unknown token 404s (notFound()). This is a server component: the case
   payload is evaluated here and only the derived brief data (uc / ev / arch)
   crosses into the client ShowcaseBrief — no session, no user id, no token,
   no other user's data. */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [link] = await db.select().from(shareLinks)
    .where(and(eq(shareLinks.token, token), eq(shareLinks.revoked, false)));
  if (!link) notFound();

  const [row] = await db.select().from(useCases).where(eq(useCases.id, link.useCaseId));
  if (!row) notFound();

  const uc = row.payload as UseCase;
  const ev = evaluate(uc);
  const arch = recArchitecture(uc);
  // No onBack → the brief renders without the practitioner-view escape hatch.
  return <ShowcaseBrief uc={uc} ev={ev} arch={arch} />;
}
