# FINAL REPORT — AI Use-Case Studio v1

Build report per `FABLE-BRIEF.md`'s Final-report requirement, covering the main brief (M0–M4) and the Delivery Kit addendum (DK-1–DK-5). Written to be honest about what is verified vs. partial vs. not built — read the "Not built / stubbed / BLOCKED" and "Known gaps" sections, not just the milestone list.

Everything below is merged to `main` and pushed to `origin/main`.

---

## What shipped per milestone

| Milestone | What shipped | Commit(s) |
|---|---|---|
| **M0 — Compile reality check** | Confirmed build + engine/kit test suites green; generated migration + tsconfig/next-env committed. Infra (Neon dev+prod, Vercel, Google OAuth) was already stood up before this session. | `0ad5648` (on `c2de047` starter) |
| **M1 — Auth complete** | Google OAuth (pre-existing) + Resend magic-link provider as a second sign-in; `/studio/*` session guard via middleware; sign-out; unauthenticated-401 tests on every API route/method. | `ace06f9`, `9b5d7ff` |
| **M2 — Port the UI** | Four-stage practitioner UI + Showcase brief ported from the reference artifact into modular client components; library wired to `/api/use-cases` with optimistic save + honest "save failed" behavior; blueprint SVG matrix, tunable weights/thresholds, both worked examples, print stylesheet. | `2d040ff` |
| **M3 — Multi-user product surface** | Zod validation on POST/PUT (reject structural garbage, clamp scores 0–5 / weights ≥0, passthrough unknown keys); crypto-random share links with owner-scoped create/revoke; public `/s/[token]` server-rendered brief; per-verdict library grouping; revoked/missing link → real 404. | `d47d31f`, `a47b822`, `6ce23bc`, `527db4c` |
| **M4 — E2E, CI, deploy** | Real-Postgres integration suite; onboarding seed (both worked examples on first login) + Vercel Analytics; Playwright e2e (acceptance-bar journey + share-link flow); GitHub Actions pipeline (install → build → unit → integration → e2e) with a disposable Neon branch per run. | `0e49bc7`, `4056354`, `c5865c1`, `888287a` (+ `570cc6d`/`fcad610` CI Neon debugging) |
| **M5 — Polish pass** | **Not executed** (see Known gaps). | — |
| **DK-1 — Deliver stage** | Sixth "Deliver" tab; engagement-inputs panel bound to `EngagementInputs`, persisted additively on the case payload's jsonb; readiness note surfaced prominently for non-BUILD verdicts (from `buildSow`, not re-derived). | `5e78087` |
| **DK-2 — Render the four sections** | Discovery guide (PROBE items flagged), SOW (not-legal-advice disclaimer first), CPMAI delivery plan (six phase cards + v7 note), risk register (colour-coded L/I table) — each from its structured builder. Visual-fidelity checked. | `c6fc9ac` |
| **DK-3 — Portfolio view** | Portfolio summary on the Library tab from `buildPortfolio` over the signed-in user's rows: narrative, quadrant distribution, ranked list, quick-wins-first sequencing. | `ca63070` |
| **DK-4 — Exports** | Markdown download + copy via `deliveryKitToMarkdown` (zero deps); print stylesheet for the Deliver view (mirrors Showcase). `.docx` skipped (see below). | `1387ad9` |
| **DK-5 — Tests** | Engagement save/load round-trip; PARK-case full-stage render; portfolio ordering (pinned); Playwright evaluate→Deliver→export-markdown; fixed a locator regression DK-3 introduced in the acceptance-journey spec. | `0f9cdd8` |
| **Post-DK addendum** | CPMAI trademark/independence disclaimer appended to the single-source delivery-plan note (renders in both the Deliver section and the markdown export). | `6e49826` |

---

## Test counts (as of this report)

| Suite | Command | Count | Notes |
|---|---|---|---|
| Unit | `npm run test` | **93 tests / 16 files** | Mock-only; never touches a real DB. Includes engine, delivery-kit builders, Zod validation, API-route auth/validation, and jsdom component tests. |
| Integration | `npm run test:integration` | **5 tests / 2 files** | Real Postgres. Cross-user isolation, score clamping through a real insert, share-link revoke, cascade delete, onboarding seed. Self-cleaning (tagged rows). |
| E2E (Playwright) | `npx playwright test` | **3 specs** | `acceptance-journey`, `share-link`, `deliver-export`. Run against a built app + real Postgres. |

All three suites pass locally at time of writing. Engine correctness is pinned to the reference artifact's known outputs (composite 77 / BUILD / Quick win for the policy-assistant example) in `src/lib/engine.test.ts`.

---

## Deployment

- **Deployed URL:** https://use-case-studio.vercel.app
- **Auto-deploy:** pushing to `main` triggers a Vercel production deployment automatically (Vercel Git integration). No manual deploy step.
- Production and dev use **two separate Neon projects**. Prod Neon has never been migrated or written to during this build except where the owner explicitly did so.
- *Not independently verified in this session:* that each individual post-merge Vercel deployment succeeded, and that the GitHub Actions `integration`/`e2e` jobs have gone green end-to-end on CI (no `gh` access here; the `build-and-unit` job was reported green by the owner, and the Neon `NEON_PROJECT_ID` secret was corrected after a 400 — but a fully-green CI run of all three jobs is unconfirmed from my side).

---

## Environment variables the owner must set (names only)

### Local (`.env`, copy from `.env.example`)
- `DATABASE_URL` — dev Neon pooled connection string
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `AUTH_RESEND_KEY`

### Vercel (Production env vars)
- `DATABASE_URL` — **prod** Neon connection string
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `AUTH_RESEND_KEY`
- `AUTH_URL` — only needed on a custom domain; auto-detected on `*.vercel.app`

### GitHub Actions (repo secrets — Settings → Secrets and variables → Actions)
- `DATABASE_URL` — only needs to be a syntactically valid Postgres URL for the build/unit job (never opens a real connection there)
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `AUTH_RESEND_KEY`
- `NEON_API_KEY` — provisions the disposable per-run Neon branch for integration/e2e
- `NEON_PROJECT_ID` — the Neon project the CI branch is cut from (not secret; could be a repo Variable instead)

Values are the owner's to supply; none appear in the repo.

---

## Not built / stubbed / BLOCKED

- **Real OAuth in e2e — DB-session bypass (BLOCKED).** Playwright can't drive real Google OAuth / Resend magic-link headlessly without live test credentials. `e2e/helpers/test-session.ts` inserts a real user + database-session row (the same tables Auth.js's adapter populates) and sets the session cookie, exercising the app's real database-session lookup path. The OAuth redirect dance itself is **not** exercised by e2e.
- **`.docx` export — skipped (explicit stretch).** The brief says not to claim it works without opening a generated file; this environment can't open/verify a `.docx`, so it was left out. The markdown + print-to-PDF path is the shipped export route and is sufficient for v1.
- **M5 polish pass — not executed.** Empty states, loading skeletons, mobile pass on the four stages, focus states, error boundaries, and designed 404/500 pages were not built. Consequence: a revoked/missing `/s/[token]` currently `notFound()`s to Next's **default** 404 page rather than a design-system 404 (the designed page was scoped to M5).
- **Lighthouse accessibility ≥90 — not measured.** The brief's acceptance bar includes a Lighthouse a11y ≥90 target on the studio and share pages; Lighthouse was never run, so this criterion is unverified.

---

## Known gaps / follow-ups

- **Run M5** to close the polish items above, most notably a design-system 404 page (the share-link revocation path lands on the default Next 404 today).
- **Confirm a fully-green CI run** of the `integration` and `e2e` jobs on GitHub Actions (Neon branch provisioning), now that `NEON_PROJECT_ID` is corrected.
- **Measure Lighthouse accessibility** on `/studio` and `/s/[token]`; fix to ≥90 if short.
- **Resend sender domain:** production magic-link uses `onboarding@resend.dev` (Resend's shared test domain). Move to a verified sending domain before real external use.
- **Vercel Analytics** is wired in the layout but only reports once **Web Analytics is enabled in the Vercel project** — until then the client script 404s harmlessly.
- **`package-lock.json` is gitignored** (pre-existing repo convention), so CI uses `npm install`, not `npm ci` — no locked, reproducible dependency tree. Consider committing the lockfile for reproducibility.
- **Benign build warning:** Auth.js's `jose` uses `CompressionStream` flagged as unsupported in the Edge Runtime. It doesn't fail the build and isn't hit by the database-session flow; left as-is.
- **Real OAuth end-to-end** remains manually verified only (owner confirmed Google sign-in live); no automated coverage of the redirect/callback.

---

*Heuristic instrument — this tool's outputs are defensible starting points, not guarantees. Framework references (CRISP-DM · NIST AI RMF 1.0 · TRL/DRL · Impact×Effort · CPMAI) are used as documented; CPMAI is a trademark of its respective owner and this tool is independent of and unaffiliated with them.*
