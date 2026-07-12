import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { shareLinks, useCases } from "@/db/schema";
import { evaluate, recArchitecture, type UseCase } from "@/lib/engine";
import { toPublicBrief } from "@/lib/sharing";
import { ShowcaseBrief } from "@/app/studio/components/ShowcaseBrief";

/* Revocation must always be honored: never statically prerender or serve this
   from the Full Route Cache, so every read re-checks the (revoked=false) filter
   against the database. Without this the route is dynamic only implicitly (via
   the params/db access); pinning it makes that a guarantee, not a side effect. */
export const dynamic = "force-dynamic";

/* Share links are unlisted capability URLs — keep them out of search indexes so
   a token can't be discovered via a crawler. Pairs with the X-Robots-Tag and
   Referrer-Policy headers set for /s/* in next.config.mjs. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/* Public, read-only Showcase brief. No auth — access is the unguessable token,
   and a revoked link (revoked=true) simply won't match, so a revoked or
   unknown token 404s (notFound()). This is a server component: no session,
   user id, or token crosses into the client.
   The raw use_case payload carries practitioner-confidential inputs (budget,
   cost, compliance, raw scores/weights) that the brief never renders — but
   client-component props are serialized into the page, so we do NOT hand the
   raw payload over. toPublicBrief() strips it to exactly the fields the brief
   shows before any of it reaches the browser. */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [link] = await db.select().from(shareLinks)
    .where(and(eq(shareLinks.token, token), eq(shareLinks.revoked, false)));
  if (!link) notFound();

  const [row] = await db.select().from(useCases).where(eq(useCases.id, link.useCaseId));
  if (!row) notFound();

  const raw = row.payload as UseCase;
  const { uc, ev } = toPublicBrief(raw, evaluate(raw));
  const arch = recArchitecture(raw); // derived narrative only — no confidential inputs
  // No onBack → the brief renders without the practitioner-view escape hatch.
  return <ShowcaseBrief uc={uc} ev={ev} arch={arch} />;
}
