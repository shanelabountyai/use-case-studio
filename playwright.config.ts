import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/* e2e config. Tests hit a real running app (next start) backed by a real
   Postgres database (DATABASE_URL) — in CI that's a disposable Neon branch,
   never dev or prod (see .github/workflows/ci.yml). Auth is bypassed via a
   direct database-session helper (e2e/helpers/test-session.ts) since real
   Google OAuth / Resend magic-link sign-in can't be driven headlessly
   without live test credentials — see the M4 report for that BLOCKED item. */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        // `next start` runs in production mode, where Auth.js only trusts the
        // request Host header on known platforms (Vercel sets this itself via
        // VERCEL=1). Without it, every auth() call in middleware throws
        // UntrustedHost and /studio never renders past a blank/broken page.
        env: { ...process.env, AUTH_TRUST_HOST: "true" },
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
