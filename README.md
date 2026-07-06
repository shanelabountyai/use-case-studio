# AI Use-Case Studio — multi-user web app (starter)

From raw idea to a defensible **build / refine / park** decision — with the architecture, workflow, data plan and test plan to back it. This repo is the production starter for the tool originally built as a Claude artifact; the artifact lives in `reference/` and is the design source of truth.

## Honest status — what's real vs. stubbed

**Built and verified:**
- `src/lib/engine.ts` — the complete evaluation engine (scoring, weights, tunable thresholds, verdicts, flags, architecture/workflow/data/testing recommendations, CSV, Obsidian note/index, reusable prompt). Pure functions, strict-TypeScript clean, and verified to reproduce the reference artifact's known outputs (composite 77 / BUILD / Quick win for the policy-assistant example).
- `src/lib/engine.test.ts` — seed vitest suite pinned to those verified outputs.
- `src/db/schema.ts` — Drizzle schema: Auth.js tables + `use_case` + `share_link`.
- API routes for list/create/read/update/delete with per-user scoping, and **verdicts computed server-side** from the payload (the client's verdict is never trusted).
- Auth.js v5 config (Google), sign-in landing page, protected `/studio` shell, public `/s/[token]` share stub.


## Delivery Kit module (post-BUILD)

`src/lib/deliverykit.ts` extends the engine with the forward-deployed delivery kit — built and tested here (15/15 tests pass across engine + kit). Pure builders that reuse `evaluate()`:
- **Discovery guide** — intake questions with targeted probes where the case is thin.
- **Use-case portfolio** — rollup across saved cases, quick-wins-first sequencing.
- **SOW / proposal** — acceptance criteria tied to the case's acceptance bar; carries a not-legal-advice disclaimer; readiness note when the verdict isn't BUILD.
- **CPMAI-aligned delivery plan** — the six phases tailored from the case's own architecture/data/testing recommendations.
- **Risk register** — risks derived from the case's flags and scores.

Wiring it into the app UI is `FABLE-BRIEF-DELIVERY-KIT.md`. A rendered sample for the policy-assistant case ships as `delivery-kit-sample.md` alongside this repo.

**Stubbed — completed by the Fable brief (`FABLE-BRIEF.md`):**
- The full four-stage UI (port from `reference/ai-use-case-studio.jsx`)
- Zod validation on API payloads; share-link create/revoke endpoints; full public brief page
- Expanded tests, e2e, CI, deployment polish

**Not yet run:** `npm install` / `next build` have not been executed in this scaffold (only the engine was compiled and tested standalone). Expect M0 of the brief to be "install, compile, fix any version drift." Dependency versions in `package.json` are recent-known-good ranges, not gospel.

## Stack (and why)

- **Next.js 15 (App Router) on Vercel** — one deploy surface for UI + API; free tier is fine for v1.
- **Neon Postgres + Drizzle ORM** — serverless-friendly Postgres; Drizzle keeps the schema in TypeScript next to the code.
- **Auth.js v5 (Google OAuth)** — lowest-friction real accounts; magic-link email is an M1 add.
- **Vitest** — engine is pure functions, so most of the tool's correctness is cheaply unit-testable.

These are defensible defaults, not the only valid choices — swap freely (e.g., Supabase for Neon+Auth) and the engine is unaffected.

## Setup

1. `npm install`
2. Create a Neon project (neon.tech), copy the connection string → `DATABASE_URL` in `.env` (copy `.env.example`).
3. `npx auth secret` → `AUTH_SECRET`.
4. Google Cloud Console → OAuth client (Web). Redirect URI: `http://localhost:3000/api/auth/callback/google` (add the production URL later). → `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
5. `npm run db:generate && npm run db:migrate`
6. `npm run test` — engine suite should pass before you touch anything else.
7. `npm run dev`

## Deploy (Vercel)

Import the repo in Vercel, set the four env vars, add the production callback URL to the Google OAuth client, done. Neon and Vercel both have integrations that can wire `DATABASE_URL` automatically.

## Architecture notes

- `payload` (jsonb) is the source of truth for a use case; `verdict/composite/quadrant` columns are denormalized for cheap list queries and always recomputed server-side on write.
- Multi-tenancy is enforced at the query level: every read/write is scoped `WHERE id = ? AND user_id = ?`.
- Share links are unguessable-token public reads, revocable, read-only — no auth data crosses that boundary.
