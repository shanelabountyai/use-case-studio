# AI Use-Case Studio — repo conventions for Claude Code

## Git & deploy workflow (as of July 8, 2026)

- **You (Claude Code) own all git operations**: commit and push to `origin/main` (github.com/shanelabountyai/use-case-studio). Other Claude surfaces (Cowork) may edit files in this folder but do NOT touch git — pick their changes up in your next commit. If `git status` shows modifications you don't recognize, they're likely Cowork edits: review and fold them into a commit rather than discarding.
- **Vercel deploys this repo on push to main** (Next.js auto-detected; set up per `SETUP.md` Part B). A push = a production deploy attempt, so run the checks below before pushing.
- **Pre-push bar:** `npm run typecheck` (or `tsc --noEmit`) and the vitest suite green. Test files are excluded from the production build type-check (see commit `1bb0912`) — don't re-include them.
- **Never commit:** `.env` / `.env.*` (Neon URL, `AUTH_SECRET`, Google OAuth secrets live only in local `.env` and Vercel env vars), `node_modules/`, `playwright-report/`, `test-results/`.

## Architecture rules that keep biting

- `src/lib/engine.ts` is pure functions and the product's core — its outputs are pinned by `engine.test.ts` (reference case: composite 77 / BUILD). Don't change scoring behavior without updating the pinned tests deliberately and saying so in the commit message.
- **Verdicts are computed server-side**; the client's verdict is never trusted. Keep it that way in any new API surface.
- `reference/ai-use-case-studio.jsx` (the original Claude artifact) is the **design source of truth** for the four-stage UI.
- Delivery Kit builders live in `src/lib/deliverykit.ts` and must stay pure (reuse `evaluate()`, no I/O).

## Key docs

- `FABLE-BRIEF.md` — main build brief (four-stage UI port, zod on APIs, share links, e2e, CI).
- `FABLE-BRIEF-DELIVERY-KIT.md` — wiring the delivery-kit module into the UI.
- `PLAN.md` / `FINAL-REPORT.md` — milestone plan and current status.
- `SETUP.md` — local run + Vercel/Neon/Google OAuth setup (humans do the credential steps, not you).
- `RUN-WITH-FABLE.md` — model-selection guidance per milestone.
