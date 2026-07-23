# Build Kickoff — Claude Code Starter

A paste-ready kickoff for building the **Build Kickoff** feature (Phase 0) in this repo with Claude Code.

## How to use
1. Open Claude Code in the `use-case-studio` repo root.
2. If a stale lock is present, clear it first: `rm -f .git/index.lock`.
3. Paste the **Kickoff Prompt** block below as your first message.
4. Work one ticket at a time. At each checkpoint Claude Code stops, runs checks, and summarizes — you review, then say "continue" (and approve the commit).

Specs live in-repo so Claude Code can read them:
- `docs/build-kickoff/PRD.md` — the engineering-ready PRD (v2). Source of truth for architecture, data contracts, guardrails.
- `docs/build-kickoff/TICKETS.md` — the Phase-0 ticket breakdown, dependency graph, acceptance criteria + tests.
- `docs/build-kickoff/PROTOTYPE-run1-rag-build.md`, `PROTOTYPE-run2-classify-refine.md` — worked examples; use as golden cases for the eval harness (BK-7).

---

## Kickoff Prompt (paste this)

```
You are building Phase 0 of the "Build Kickoff" feature in this repo (an existing
Next.js + Auth.js v5 + Drizzle + Neon Postgres app on Vercel). Read these first and
treat them as the source of truth:

- docs/build-kickoff/PRD.md      (architecture, data contracts, guardrails)
- docs/build-kickoff/TICKETS.md  (BK-S1..BK-7: scope, acceptance criteria, tests, build order)
- CLAUDE.md                      (repo conventions — obey them)
- src/lib/engine.ts              (the pure engine you will ground on; DO NOT fork or re-score it)

WHAT WE'RE BUILDING (Phase 0, smallest slice): BUILD-only, lookup-only, an ASYNC job
that turns a verified use case into an implementation plan via a 2-call LLM pipeline
(Call 1 = planner, Call 2 = an INDEPENDENT critic), persisted as a draft that must be
approved before export. Everything is behind a feature flag.

NON-NEGOTIABLE INVARIANTS (from the PRD — enforce in code and call out if anything fights them):
- Async job only (Vercel can't hold a multi-minute sync run): trigger -> queue -> worker -> persist -> poll.
- 2-call topology. The critic call receives ONLY the plan + grounding, never the planner's
  internal messages — its independence is the product's core value.
- Verdict is re-derived SERVER-SIDE from the stored case; never trust a client-supplied verdict.
- Guardrails carried into every prompt AND checked: no fabricated benchmarks/vendors/ROI,
  every estimate labeled, the case's acceptance bar is the spine, decision-support (not a guarantee)
  disclaimer bound to the artifact at the data layer.
- Safety P0s are not optional: inputs-completeness pre-check before any spend; draft->approve gate
  before export; provenance pin; partial-lane status (never render a "green" critic audit over a
  missing lane); PII confirm path; per-run token cap + timeout + feature flag + kill switch.
- Engine stays pure; verdicts server-side; don't fork engine.ts (per CLAUDE.md).

BUILD ORDER — respect dependencies in TICKETS.md:
- The two spikes (BK-S1 provider/cost, BK-S2 job-runner) are DECISIONS, not code. Do BK-S2 first
  WITH me: research and recommend the least-new-infra async mechanism on THIS Vercel+Neon stack
  (e.g., a Neon-backed job table + cron/worker vs a durable queue), then stop for my decision.
  For BK-S1, list what you need me to confirm (model + caps); do not hardcode a provider yet.
- Then build the PROVIDER-INDEPENDENT foundation first, in this order, so we make progress before
  the provider is chosen: BK-0 (Zod contracts + build_kickoff_plan Drizzle migration on DEV Neon only)
  -> BK-2 (grounding serializer, pure + golden tests) -> BK-1 (job plumbing/trigger/guards with the
  LLM stages STUBBED) -> scaffold BK-7 (eval harness structure + the two prototype cases as golden inputs).
- Do NOT start BK-3 (planner) or BK-4 (critic) real LLM calls until I've resolved BK-S1. Stub the
  provider boundary behind an interface so those tickets slot in cleanly.

WORKING RULES:
- One ticket at a time. Write the tests specified in that ticket AS you build it.
- After each ticket: run `npx tsc --noEmit` and the vitest suite; do NOT run `npm run build` while a
  dev server is running (per CLAUDE.md). Then STOP, summarize what changed + test results, and WAIT
  for my review before continuing. Do not start the next ticket unprompted.
- You own git (per CLAUDE.md), but do not push to main until I approve at a checkpoint. Feature-flag
  the whole feature OFF by default. Never touch the prod database or run prod migrations.
- Out of scope for Phase 0 (do not build): REFINE gating (stub -> 501), classify/other templates,
  accept-critic-fix, version diff UI, Deliver/PPTX integration, caching, scaffold-to-repo. Flag if
  you think something P1 is truly needed for P0.

Start now with BK-S2: give me your recommended async job mechanism for this stack, with a short
rationale and the tradeoffs, then stop for my decision. After I decide, proceed to BK-0.
```

---

## Why it starts this way
- **Spikes before code.** The provider and job-runner choices gate the LLM tickets; resolving BK-S2 first (which Claude Code can research on your actual stack) unblocks the async plumbing, and BK-S1 only needs your confirmation of a model + caps.
- **Provider-independent foundation first.** BK-0 (contracts + migration), BK-2 (serializer), BK-1 (plumbing with stubbed LLM stages), and the BK-7 harness scaffold can all be built and tested before a single real LLM call — so you make real, reviewable progress immediately and de-risk the plumbing.
- **Eval-first, mirroring the studio's own thesis.** BK-7 (golden cases from the two prototype runs + the planted-fabrication set that validates the critic) is treated as the launch gate, not an afterthought.
- **Checkpoint cadence matches your workflow.** Claude Code stops after each ticket, runs `tsc --noEmit` + vitest, summarizes, and waits — you approve before it moves on or pushes, exactly like the milestone loop you used for the original studio build.

## First-session checklist (for you)
- [ ] `rm -f .git/index.lock` if a stale lock is present.
- [ ] Paste the Kickoff Prompt; get BK-S2's recommendation; decide the job mechanism.
- [ ] Confirm BK-S1: pick the LLM provider + set the per-run token cap / timeout / per-user ceiling (BK-S1 note in TICKETS.md).
- [ ] Let it build BK-0 → review the schemas + migration (dev Neon only) → approve.
- [ ] Proceed BK-2 → BK-1 (stubbed) → BK-7 scaffold, reviewing at each checkpoint.
- [ ] Only after BK-S1 is resolved: BK-3 → BK-4 → BK-5/BK-6, then assemble the BK-7 launch gate.
