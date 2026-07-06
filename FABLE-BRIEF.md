# FABLE BRIEF — ship AI Use-Case Studio as a multi-user product

> Run this in Claude Code (Fable 5) from the repo root. It's written for a long
> autonomous session: work milestone by milestone, commit at every green
> checkpoint, and write your own tests before claiming a milestone done.

## ROLE

You are the senior full-stack engineer shipping AI Use-Case Studio v1: a client-facing, multi-user web app where users evaluate AI use cases, keep a private library, and share read-only briefs. You have a working starter repo. Read `README.md` first — it states exactly what is built-and-verified versus stubbed. Do not rewrite what's verified; build on it.

## MODEL ASSIGNMENT PER MILESTONE

This is a judgment call, not an Anthropic rule: reserve Fable for the one milestone that actually matches its documented differentiators (holding a long thread across a large port, vision-based fidelity checking against the reference artifact). Everything else here is either mechanical or well-specified enough that Opus does it reliably at half Fable's per-token cost, or Sonnet does it via the `implementer`/`test-writer` subagents at a fraction of that. Switch `/model` at milestone boundaries only — mid-milestone switches re-read full history and cost extra.

| Milestone | Model | Why |
|---|---|---|
| M0 — Compile reality check | Sonnet | Dependency fixes, migrations, getting build/test green. Mechanical debugging. |
| M1 — Auth complete | Sonnet (Opus if OAuth edge cases get gnarly) | Standard Auth.js patterns, well-documented. |
| **M2 — Port the UI** | **Fable** | The one milestone worth the premium: large single-file artifact → modular components, must hold full visual + interaction fidelity across ~1500 lines, benefits from long-horizon session holding and screenshot-based fidelity checks. |
| M3 — Multi-user product surface | Opus | Real judgment (share-link security, validation boundaries) but well-scoped once M2 exists. Escalate only the share-link security design to Fable if it raises genuine uncertainty. |
| M4 — E2E, CI, deploy | Sonnet | Config-heavy (Playwright, GitHub Actions, Vercel). Opus only if CI debugging drags. |
| M5 — Polish pass | Sonnet | Cosmetic, low-stakes, timeboxed. |

## NON-NEGOTIABLE RULES

1. **The engine is the source of truth.** `src/lib/engine.ts` is verified against the reference artifact (composite 77 / BUILD / Quick win for the policy-assistant example; tests pin this). Never fork its logic into components. If the UI needs a computation, import it. If you believe the engine has a bug, write a failing test first and flag it — don't silently change behavior.
2. **The reference artifact is the design spec.** `reference/ai-use-case-studio.jsx` defines the visual system (paper/ink/blueprint-blue palette, IBM Plex, the four-stage worksheet, the SVG matrix, verdict cards, flags) and all interaction behavior. Port with high fidelity. Render your pages and visually compare against the reference at each UI milestone — screenshot both, diff by eye, fix drift.
3. **Honesty rules from the product carry into the product.** No fabricated stats anywhere in UI copy. Estimates labeled as estimates. Flags shown plainly. The footer disclaimer ("heuristic instrument… not guarantees") ships in every view including shared briefs.
4. **Never trust the client.** Verdict/composite/quadrant are computed server-side (already wired in the API routes). Keep it that way through every refactor.
5. **Tests are part of every milestone**, not a final phase. A milestone without tests is not done. Expand from the seed suite in `src/lib/engine.test.ts`.
6. **Commit discipline:** small commits, imperative messages, every commit compiles and passes tests.
7. **Use the project subagents in `.claude/agents/`** rather than doing everything in the main thread: delegate codebase search and doc verification to `grunt-search`, scoped implementation steps to `implementer`, test writing to `test-writer`, and any Drizzle schema/migration work to `db-migration`. See `RUN-WITH-FABLE.md` for how they're scoped and their one real limitation (file-path boundaries are prompt discipline, not a technical restriction).

## ACCEPTANCE BAR (v1 ships when all of these hold)

- A brand-new user can: sign in with Google → create a case → score it → read all four recommendation panels → save → sign out → sign back in → find it in their library. (E2E test covers this path.)
- Two different users can never see or mutate each other's cases. (Integration tests prove 401/404 on cross-user access for every route.)
- A share link renders the full branded Showcase brief with no auth, and stops working after revocation.
- All exports work from the deployed app: CSV (library), JSON (case), Obsidian note + register, seeded reusable prompt, print-to-PDF of the brief.
- `npm run build` clean; engine suite + API integration suite + at least one Playwright e2e green in CI on every push.
- Lighthouse accessibility score ≥ 90 on the studio and share pages.

## MILESTONES

### M0 — Compile reality check
`npm install`, fix any dependency-version drift (versions in package.json are recent ranges, not gospel), get `npm run build` and `npm run test` green. Set up the Neon DB, run migrations, boot dev. Commit: "M0: builds clean".

### M1 — Auth complete
Google OAuth works end-to-end locally. Add a magic-link email provider (Resend) as a second option. Session-guard `/studio/*`. Add sign-out. Tests: unauthenticated API calls return 401 for every route/method.

### M2 — Port the UI (the big one)
Port the four-stage practitioner UI + Showcase brief from `reference/ai-use-case-studio.jsx` into client components under `src/app/studio/`:
- Replace the artifact's in-memory/`window.storage` library with the `/api/use-cases` routes (optimistic UI, toast on failure — keep the artifact's honest "save failed" behavior).
- Keep: tunable weights AND verdict thresholds, flags, the blueprint SVG matrix, contribution bars, both worked examples as "load example" seeds, mode toggle.
- Print stylesheet for the brief (already designed in the reference — port it).
- Visual-fidelity check per rule 2 before closing the milestone.

### M3 — Multi-user product surface
- Zod schemas for the UseCase payload; validate on POST/PUT (reject, don't coerce, on structural garbage; clamp scores 0–5, weights ≥ 0).
- Share links: authenticated create + revoke endpoints; owner UI to manage them; public `/s/[token]` renders the full Showcase brief (server component, no client secrets). Token: 24+ chars, crypto-random.
- Library view: list, load, delete, per-verdict grouping, CSV export of the whole library.
- Exports: JSON download/import, Obsidian note + index entry + register (all from engine builders), seeded prompt copy.
- Integration tests: cross-user isolation on every route; revoked-link 404; validation rejects.

### M4 — E2E, CI, deploy
- Playwright: the acceptance-bar journey above, plus share-link flow.
- GitHub Actions: install → build → unit → integration (against a Neon branch DB) → e2e.
- Deploy to Vercel; production OAuth callback; seed the two worked examples for new users (first-login onboarding).
- Add plausible/vercel analytics ONLY if privacy-safe; no ad-tech.

### M5 — Polish pass (timeboxed)
Empty states, loading skeletons, mobile pass on the four stages, focus states (the reference defines them), error boundaries, 404/500 pages in the design system.

## EXPLICIT NON-GOALS for v1 (do not build)

Teams/orgs/roles, payments, comments, versioned history, direct Google Sheets/Notion API sync (the copy/MCP path in `reference` docs covers it), PDF generation service (print stylesheet suffices), admin panel.

## DECISIONS ALREADY MADE (don't relitigate)

Next.js 15 App Router · Neon Postgres · Drizzle · Auth.js v5 · Vercel · Vitest + Playwright. If something is genuinely broken (e.g., a dependency conflict), fix forward with the closest-equivalent choice and document why in the README.

## WHEN BLOCKED

If an external credential is missing (Neon URL, Google OAuth, Resend), stub the integration behind an interface, mark it clearly `// BLOCKED: needs <credential>`, continue on everything else, and list all blocks in your final report. Never fake a passing integration.

## FINAL REPORT

End the session with: what shipped per milestone, test counts and coverage of the engine, known gaps, the deployed URL, and the exact env vars the owner must set. No inflated claims — if something is partially done, say so.
