import { timingSafeEqual } from "node:crypto";

/* Shared-secret checks (scorecard K8 / K14). Two rules, copied from the
   foundation's src/core/tokens.ts + src/core/cron.ts:
   - compare in constant time, so response timing never leaks how much of a
     guess matched;
   - fail closed: an unset secret means "nobody gets in", never "anyone does". */

/** Constant-time string compare. False on any length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** True only when `secret` is set and `provided` equals it exactly. */
export function matchesSecret(provided: unknown, secret: string | undefined): boolean {
  if (!secret) return false;
  return typeof provided === "string" && safeEqual(provided, secret);
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Header only, never
 *  the URL; refuses everything when CRON_SECRET is unset. */
export function isAuthorizedCron(req: Request, secret: string | undefined = process.env.CRON_SECRET): boolean {
  if (!secret) return false;
  return safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`);
}
