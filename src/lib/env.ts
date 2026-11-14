import { z } from "zod";

/* Scorecard K11 (foundation INV-14): every environment variable the app reads,
   validated once at server boot (src/instrumentation.ts). `.env.example` must
   name exactly these keys (env.test.ts checks it). No NEXT_PUBLIC_* key may
   hold a secret; there are none today. Add a key here and to .env.example in
   the same commit. */

const flag = z.enum(["true", "false"]).optional();
const positiveInt = z.string().regex(/^\d+$/, "must be a whole number").optional();

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Database (Neon / Postgres)
  DATABASE_URL: z.string().min(1),
  // Auth.js
  AUTH_SECRET: z.string().min(1).optional(), // required in production (below)
  AUTH_GOOGLE_ID: z.string().min(1).optional(),
  AUTH_GOOGLE_SECRET: z.string().min(1).optional(),
  AUTH_RESEND_KEY: z.string().min(1).optional(), // magic-link sign-in + intake notification
  AUTH_TRUST_HOST: flag, // set for `next start` off Vercel (playwright webServer)
  // Public discovery intake (/api/intake). Unset INTAKE_KEY = intake refuses every submission.
  INTAKE_KEY: z.string().min(1).optional(),
  INTAKE_OWNER_EMAIL: z.string().email().optional(),
  // Kickoff worker (Vercel Cron bearer). Unset = /api/kickoff/worker refuses.
  CRON_SECRET: z.string().min(1).optional(),
  // Kickoff (Build Kickoff planner)
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  KICKOFF_ENABLED: flag,
  KICKOFF_KILL_SWITCH: flag,
  KICKOFF_MODEL: z.string().min(1).optional(),
  KICKOFF_TOKEN_CAP: positiveInt,
  KICKOFF_TIMEOUT_MS: positiveInt,
  KICKOFF_MAX_CONCURRENT: positiveInt,
  KICKOFF_DAILY_CEILING: positiveInt,
  // Platform / test harness
  VERCEL_ENV: z.string().optional(), // set by Vercel; marks a deployed environment
});

export type Env = z.infer<typeof envSchema>;

/** Validate an env source. Throws naming the bad keys only — never values. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  // An empty `NAME=` line (a key waiting for its value) is unset, not an invalid empty string.
  const result = envSchema.safeParse(Object.fromEntries(Object.entries(source).filter(([, v]) => v !== "")));
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((i) => i.path.join(".")))].join(", ");
    throw new Error(`Invalid environment: ${keys}`);
  }
  const e = result.data;
  if (e.NODE_ENV === "production" && !e.AUTH_SECRET) {
    throw new Error("Invalid environment: AUTH_SECRET (required in production)");
  }
  // Scorecard K10 (INV-13): a production deploy with no email provider would
  // silently drop every magic-link sign-in and every intake notification.
  if (e.VERCEL_ENV === "production" && !e.AUTH_RESEND_KEY) {
    throw new Error("Invalid environment: AUTH_RESEND_KEY (required in production)");
  }
  return e;
}
