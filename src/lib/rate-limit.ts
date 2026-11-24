import { lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";

/* Fixed-window counters in Postgres (scorecard K5, foundation INV-09), so a
   limit survives a cold start and holds across every serverless instance.
   One atomic upsert per hit: no read-then-write race. A fixed window allows
   up to 2x the limit across a window edge; fine for abuse caps. */

export type Limit = { limit: number; windowMs: number };

export const LIMITS = {
  // Public discovery form submissions (/api/intake), per client IP.
  intakePerIp: { limit: 20, windowMs: 60_000 },
  // Anonymous reads of /s/[token], per client IP. Generous for a person.
  shareReadPerIp: { limit: 60, windowMs: 60_000 },
  // Magic-link / sign-in POSTs to Auth.js, per client IP. Each one can send an email.
  signInPerIp: { limit: 10, windowMs: 15 * 60_000 },
} as const satisfies Record<string, Limit>;

export function windowStart(nowMs: number, windowMs: number): Date {
  return new Date(Math.floor(nowMs / windowMs) * windowMs);
}

/** First address in x-forwarded-for (set by Vercel), else "unknown". */
export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

/** Counts one hit against `key`. True when the hit is within the limit. */
export async function hit(key: string, { limit, windowMs }: Limit, nowMs: number = Date.now()): Promise<boolean> {
  const ws = windowStart(nowMs, windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: ws, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  return (row?.count ?? 1) <= limit;
}

/** Deletes counters whose window started over a day ago; nothing reads them. */
export async function sweepRateLimits(nowMs: number = Date.now()): Promise<void> {
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(nowMs - 86_400_000)));
}

export const tooMany = (retryAfterSec: number) => ({ status: 429, headers: { "Retry-After": String(retryAfterSec) } });
