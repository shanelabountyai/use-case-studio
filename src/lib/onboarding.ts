import { db } from "@/db";
import { useCases } from "@/db/schema";
import { evaluate } from "./engine";
import { EXAMPLES } from "./examples";

/** Seed the two worked examples for a brand-new user, so first login isn't an
 *  empty library. Auth.js's `events.createUser` fires exactly once per user
 *  (at account creation via the adapter), which is the precise hook point —
 *  it can't accidentally re-seed someone who deletes everything later. */
export async function seedExamplesForUser(userId: string): Promise<void> {
  await db.insert(useCases).values(
    EXAMPLES.map((uc) => {
      const ev = evaluate(uc);
      return {
        userId,
        name: uc.name,
        verdict: ev.verdict,
        composite: Math.round(ev.composite),
        quadrant: ev.quadrant,
        payload: uc,
      };
    }),
  );
}
