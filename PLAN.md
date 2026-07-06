# PLAN — AI Use-Case Studio v1

Execution plan for `FABLE-BRIEF.md` + `FABLE-BRIEF-DELIVERY-KIT.md`, in order. Model column is the assignment from each brief's table; switch `/model` at milestone boundaries only (per `RUN-WITH-FABLE.md`).

Status snapshot at plan time: M0's infra is already done (installed, `.env` populated, dev Neon migrated, prod deployed to Vercel at https://use-case-studio.vercel.app, Google sign-in verified live, `npm run test` 15/15, `npm run build` green). M0 below is reduced to a confirmation step — do not redo setup.

**Standing rule across every milestone:** never migrate or write to the prod Neon project unless explicitly told to. Dev and prod are separate Neon projects.

---

## M0 — Compile reality check
**Model:** Sonnet

Confirm the existing build is still green; nothing to install or configure.

- **Risks:** None expected — this is a verification step. If `build`/`test` regress, the risk is an untracked local change; diff against last commit before fixing.
- **File boundaries:** None (read-only verification).
- **Verify:** `npm run test && npm run build` — expect 15/15 tests, clean build. (Already confirmed green at plan time.)

---

## M1 — Auth complete
**Model:** Sonnet (Opus if OAuth edge cases get gnarly)

Google OAuth already works end-to-end locally and in prod. Remaining work: add Resend magic-link as a second provider, session-guard `/studio/*`, sign-out, 401 tests.

- **Risks:** Resend requires a new credential (API key) — if unavailable, stub behind an interface and mark `// BLOCKED: needs RESEND_API_KEY`, per the brief's blocked-integration rule. Session-guard middleware must not break the existing public `/s/[token]` route or the working Google flow.
- **File boundaries:** `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, middleware (new `src/middleware.ts` if added), `src/app/studio/page.tsx` (guard only, not UI), new `*.test.ts` for API 401 coverage. Do not touch `src/lib/engine.ts` or `src/lib/deliverykit.ts`.
- **Verify:** `npm run test` (new 401 tests green) && `npm run build`; manual: sign out, hit `/studio` and each `/api/use-cases*` route unauthenticated → 401/redirect.

---

## M2 — Port the UI (the big one)
**Model:** Fable

Port the four-stage practitioner UI + Showcase brief from `reference/ai-use-case-studio.jsx` (~1500 lines) into modular client components under `src/app/studio/`, wired to `/api/use-cases` instead of in-memory storage.

- **Risks:** Highest-risk milestone in the whole plan — largest surface, only one with a genuine visual-fidelity bar. Risk of silently forking engine logic into components (forbidden — must import from `src/lib/engine.ts`). Risk of losing interaction fidelity (tunable weights/thresholds, flags, blueprint SVG matrix, contribution bars, mode toggle, both worked examples, print stylesheet) across the port. Optimistic UI + toast-on-failure must preserve the artifact's honest "save failed" behavior rather than hiding it.
- **File boundaries:** New components under `src/app/studio/` (e.g. `src/app/studio/components/*`), `src/app/studio/page.tsx`. Reads from `reference/ai-use-case-studio.jsx` (read-only — do not edit) and imports from `src/lib/engine.ts` (read-only — do not fork). Does not touch API routes' verdict-computation logic.
- **Verify:** `npm run build && npm run test`; manual visual-fidelity check — screenshot the ported UI at each of the four stages plus the Showcase brief, compare by eye against `reference/ai-use-case-studio.jsx` rendered standalone, fix drift before closing.

---

## M3 — Multi-user product surface
**Model:** Opus (escalate only the share-link security design to Fable if it raises genuine uncertainty)

Zod validation on the UseCase payload, share-link create/revoke + public render, library view, exports (JSON/Obsidian/prompt).

- **Risks:** Share-link token generation must be crypto-random, 24+ chars, and the public `/s/[token]` route must leak zero authenticated data or secrets (server component only). Validation must reject structurally-garbage payloads rather than silently coercing them, while still clamping scores 0–5 and weights ≥0 — getting reject-vs-clamp backwards on the wrong field is the main correctness risk. Cross-user isolation must hold on every route, not just the obvious ones.
- **File boundaries:** New Zod schemas (e.g. `src/lib/validation.ts`), `src/app/api/use-cases/route.ts`, `src/app/api/use-cases/[id]/route.ts`, new `src/app/api/share-links/**` routes, `src/app/s/[token]/page.tsx`, library UI under `src/app/studio/` (list/delete/CSV export), `src/db/schema.ts` only if share-link fields are missing (delegate schema edits to `db-migration` subagent). Do not change engine scoring logic.
- **Verify:** `npm run test` (new integration tests: cross-user 401/404 on every route, revoked-link 404, validation rejects garbage) `&& npm run build`.

---

## M4 — E2E, CI, deploy
**Model:** Sonnet (Opus only if CI debugging drags)

Playwright e2e for the acceptance-bar journey + share-link flow; GitHub Actions pipeline; deploy polish; onboarding seed; privacy-safe analytics.

- **Risks:** CI needs a real Neon branch DB for integration tests — credential/secret wiring in GitHub Actions is the likely friction point. Must not touch prod Neon or prod env vars; deploy step should target the existing Vercel project, not recreate it. Analytics must be privacy-safe only (no ad-tech) per the brief's non-goal list.
- **File boundaries:** New `e2e/` or `playwright/` directory, `.github/workflows/*.yml`, `playwright.config.ts`, minor `vercel.json`/build-command changes if a migrate step is added to the Vercel build. Do not modify already-verified prod env vars without explicit instruction.
- **Verify:** `npx playwright test` (new e2e green) `&& npm run test && npm run build`; CI green on a pushed branch; confirm deployed URL still serves correctly after any deploy-config change.

---

## M5 — Polish pass (timeboxed)
**Model:** Sonnet

Empty states, loading skeletons, mobile pass on the four stages, focus states, error boundaries, 404/500 pages — all per the reference design system.

- **Risks:** Timeboxed and cosmetic — main risk is scope creep past the box, or drifting from the reference design system (colors/type) established in M2. Error boundaries/404/500 pages must not swallow or hide the "save failed" honesty behavior from M2.
- **File boundaries:** `src/app/studio/**` (UI-only changes), new `src/app/error.tsx`, `src/app/not-found.tsx`, `src/app/global-error.tsx`. No API or engine changes.
- **Verify:** `npm run build && npm run test`; manual: resize to mobile width, trigger a 404 and a thrown error, tab through focus states on all four stages.

---

## DK-1 — Deliver stage
**Model:** Opus

Add the sixth "Deliver" stage/tab to the studio UI; Engagement inputs panel bound to `EngagementInputs`, persisted on the case payload's jsonb.

- **Risks:** Must show the SOW's readiness note prominently for non-BUILD verdicts (builder already returns it — don't re-derive). Persisting engagement inputs on the jsonb payload must not break existing cases (engine ignores unknown fields, per README, so this should be additive-only).
- **File boundaries:** `src/app/studio/**` (new Deliver tab/components), reads `src/lib/deliverykit.ts` (read-only — do not rewrite its builders). Payload shape change may touch `src/lib/validation.ts` if M3 added strict Zod schemas (extend, don't narrow).
- **Verify:** `npm run build && npm run test`; manual: open a BUILD case and a PARK case, confirm Engagement inputs panel persists across save/reload and the readiness note shows only for non-BUILD.

---

## DK-2 — Render the four sections
**Model:** Sonnet

Render Discovery guide, SOW, Delivery plan, Risk register — each from its structured builder output, matching the reference design system.

- **Risks:** Must render from the builders' structured data (not free text) so `PROBE:` flags, the SOW disclaimer, and L/I risk coloring stay data-driven and correct — hand-authoring any of this text would violate the honesty rules. Visual-fidelity check required before closing, same bar as M2.
- **File boundaries:** New presentational components under `src/app/studio/` (e.g. `deliver/` subfolder). Read-only against `src/lib/deliverykit.ts`.
- **Verify:** `npm run build && npm run test`; visual-fidelity check against the reference design system; manual: confirm SOW disclaimer renders and CPMAI "confirm against v7" note is present.

---

## DK-3 — Portfolio view
**Model:** Sonnet

Portfolio summary on the Library tab, built from `buildPortfolio(records)` over the signed-in user's saved cases.

- **Risks:** Must scope to the signed-in user's own records only (reuse M3's cross-user isolation pattern) — an easy place to accidentally leak another user's cases into a rollup query.
- **File boundaries:** Library UI under `src/app/studio/**`. Read-only against `src/lib/deliverykit.ts`.
- **Verify:** `npm run test && npm run build`; manual: confirm portfolio ranking/sequencing matches `buildPortfolio` output for a multi-case seeded user.

---

## DK-4 — Exports
**Model:** Sonnet

Markdown download/copy via `deliveryKitToMarkdown`; print stylesheet for the Deliver view. `.docx` export is optional/stretch — do not claim it works without opening a generated file.

- **Risks:** Zero new deps needed for markdown/print; only the `.docx` stretch goal introduces a new dependency (the `docx` library) and must stay server-side if attempted. Don't claim `.docx` works without verifying a real generated file opens correctly.
- **File boundaries:** `src/app/studio/**` (export buttons, print CSS), optional new `src/app/api/deliverykit/docx/route.ts` only if the stretch goal is attempted.
- **Verify:** `npm run build && npm run test`; manual: download markdown and confirm content matches `deliveryKitToMarkdown` output, print-preview the Deliver view; if `.docx` attempted, open the generated file and confirm it's valid before reporting it as working.

---

## DK-5 — Tests
**Model:** Sonnet (delegate to `test-writer` subagent)

Extend `deliverykit.test.ts`: engagement-inputs round-trip through save/load, Deliver stage renders without crash for a PARK case, portfolio ordering. Add one Playwright step: evaluate → Deliver → export markdown.

- **Risks:** Must actually exercise the acceptance bar (round-trip, PARK-case readiness note, ordering) rather than happy-path-only assertions, per `test-writer`'s own scoping rules.
- **File boundaries:** `src/lib/deliverykit.test.ts`, e2e spec file under `e2e/`/`playwright/`. No application source changes — if a source bug is found, hand back to the main session/`implementer` rather than fixing it inline.
- **Verify:** `npm run test` (deliverykit suite green, count increased) `&& npx playwright test` (new step green).

---

## Acceptance bar (v1 ships when, from `FABLE-BRIEF.md`)
- Sign in → create → score → read all four panels → save → sign out → sign back in → find in library (E2E covers this).
- Cross-user isolation proven on every route.
- Share link renders full Showcase brief unauthenticated, stops working after revocation.
- CSV/JSON/Obsidian/prompt exports all work from the deployed app; print-to-PDF of the brief.
- `npm run build` clean; engine + API integration + at least one Playwright e2e green in CI on every push.
- Lighthouse accessibility ≥ 90 on studio and share pages.

Delivery Kit module ships when (from `FABLE-BRIEF-DELIVERY-KIT.md`): a signed-in user can open an evaluated case → fill engagement inputs → see all four sections → export the kit as markdown and print the brief; PARK case shows readiness note; SOW disclaimer present everywhere; delivery-kit tests + one e2e green.
