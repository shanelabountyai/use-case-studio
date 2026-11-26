/* Scorecard K12 (foundation INV-18, copied from src/core/db/local-guard.ts):
   test runners that touch a real database refuse a cloud one unless the run
   is deliberate. CI's disposable Neon branch sets ALLOW_CLOUD_DB=1 explicitly;
   a local run with .env still pointing at the dev/prod Neon database stops
   here instead of writing test rows into it. Dependency-free on purpose:
   playwright.config.ts and integration/setup-env.ts import it. */
const CLOUD = /neon\.tech|rds\.amazonaws|supabase\.co/;

export function assertLocalOrAllowed(url: string | undefined, e: Record<string, string | undefined> = process.env) {
  if (!url) return; // nothing to connect to; the driver fails on its own
  if (!e.VERCEL_ENV && e.ALLOW_CLOUD_DB !== "1" && CLOUD.test(url)) {
    throw new Error("Refusing a cloud database in tests. Set ALLOW_CLOUD_DB=1 to reach one deliberately (INV-18).");
  }
}
