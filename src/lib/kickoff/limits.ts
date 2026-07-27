/* Cost controls for Build Kickoff (BK-6). Per-run caps bound a single job; the
   per-user gates bound how many a user can start. Numbers come from env with the
   BK-S1 starting defaults (tuned against a measured run in BK-3). */

import { and, count, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { buildKickoffPlans } from "@/db/schema";

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export interface KickoffLimits {
  tokenCap: number; // per-run input+output tokens
  timeoutMs: number; // per-run wall clock
  maxConcurrent: number; // per-user queued+running
  dailyCeiling: number; // per-user runs started per rolling 24h
}

export function getLimits(): KickoffLimits {
  return {
    tokenCap: num(process.env.KICKOFF_TOKEN_CAP, 60_000),
    timeoutMs: num(process.env.KICKOFF_TIMEOUT_MS, 120_000),
    maxConcurrent: num(process.env.KICKOFF_MAX_CONCURRENT, 1),
    dailyCeiling: num(process.env.KICKOFF_DAILY_CEILING, 20),
  };
}

export type LimitCheck = { ok: true } | { ok: false; reason: string };

/** Per-user gate at the trigger: reject (429) when the caller is already at
 *  their concurrency limit or has hit the rolling-24h ceiling. */
export async function withinLimits(userId: string, limits = getLimits()): Promise<LimitCheck> {
  const [{ n: active } = { n: 0 }] = await db
    .select({ n: count() })
    .from(buildKickoffPlans)
    .where(
      and(
        eq(buildKickoffPlans.userId, userId),
        inArray(buildKickoffPlans.status, ["queued", "running"]),
      ),
    );
  if (active >= limits.maxConcurrent)
    return { ok: false, reason: `A run is already in progress (limit ${limits.maxConcurrent}). Wait for it to finish.` };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [{ n: today } = { n: 0 }] = await db
    .select({ n: count() })
    .from(buildKickoffPlans)
    .where(and(eq(buildKickoffPlans.userId, userId), gte(buildKickoffPlans.createdAt, since)));
  if (today >= limits.dailyCeiling)
    return { ok: false, reason: `Daily run limit reached (${limits.dailyCeiling}). Try again tomorrow.` };

  return { ok: true };
}
