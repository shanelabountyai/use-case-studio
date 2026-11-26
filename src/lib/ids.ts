/* Small request-hygiene helpers shared by the API routes. Pure, no I/O.
   Shared-secret compares live in src/lib/secrets.ts (safeEqual). */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `v` is a canonical UUID string. The `use_case`, `build_kickoff_plan`
 *  and `kickoff_feedback` primary keys are Postgres `uuid` columns: binding a
 *  non-UUID string to them makes Postgres throw (22P02), which surfaced as a
 *  500. Routes check this first and answer 404 — the same response as a row
 *  the caller doesn't own, so a malformed id reveals nothing extra. */
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

