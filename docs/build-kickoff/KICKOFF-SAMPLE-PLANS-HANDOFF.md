# Handoff — wire in Kickoff sample plans (Cowork → Claude Code)

**Status:** draft content prepared by Cowork, not reviewed, not wired into the app, not committed. This file and the two things it references are new/untracked — fold them into your next commit if you take this on.

## What this is

On 2026-08-13, Shane ran Build Kickoff live in prod against 7 of the existing `EXAMPLES` entries in `src/lib/examples.ts` — the smoke-test batch called for in the backlog. All 7 came back verdict BUILD, and all 7 critic audits came back "ship with fixes" (real load-bearing gaps found in every one — that's the critic doing its job, not a bug).

Cowork used those outputs to build:
1. A showcase gallery (delivered to Shane directly, not part of this repo).
2. 7 client-ready one-page PDF briefs (ditto).
3. **This handoff** — the app-integration idea, with content prepped and ready for review.

## The idea

Right now, trying an example case in the Studio shows the evaluation (Recommend/Evaluate stages) but nothing from Kickoff unless you actually run it — which costs money and takes a few minutes. For someone kicking the tires on the product, seeing a real sample plan (with its critic audit) up front is a much faster "does this actually work" moment than reading marketing copy.

Proposed: on the Deliver stage / `KickoffPanel.tsx`, when the loaded case matches one of the 7 example names below, show a "View sample plan" affordance before (or instead of) the run button — rendering the condensed summary inline, with a link/expand to the full plan text.

## What's here

- `src/lib/kickoff/sample-plans.ts` — **draft, not imported anywhere yet.** `KICKOFF_SAMPLE_PLANS: KickoffSamplePlan[]`, keyed by `exampleName` matching `EXAMPLES[].name` in `src/lib/examples.ts`. Condensed fields only (summary, architecture pattern, phase count/duration estimate, critic top gaps/fixes).
- `docs/build-kickoff/sample-plans/*.md` — the 7 full plan documents exactly as the pipeline produced them (architecture, data pipeline, evaluation, governance, delivery, milestones, assumptions, full independent critic audit, provenance). These are the source of truth; `sample-plans.ts` is a lossy summary of them for card/list display.

| Example name (in `examples.ts`) | slug |
|---|---|
| Internal policy & knowledge assistant | `internal-policy-knowledge-assistant` |
| Support ticket deflection & reply drafting | `support-ticket-deflection-reply-drafting` |
| Field service report summarization | `field-service-report-summarization` |
| Procurement contract clause review | `procurement-contract-clause-review` |
| Insurance FNOL intake extraction | `insurance-fnol-intake-extraction` |
| Marketing localization QA | `marketing-localization-qa` |
| Grant proposal first-draft assembly | `grant-proposal-first-draft-assembly` |

Note: 3 more EXAMPLES entries exist without a sample plan yet (Invoice & document triage, Clinical trial protocol deviation detection, Executive natural-language warehouse queries) — the last two score REFINE/PARK-adjacent (low value/feasibility), so running Kickoff on them isn't obviously useful; Invoice & document triage is a plausible 8th sample if this ships well.

## What's NOT done (needs your judgment, not just wiring)

1. **Where the full markdown renders.** `sample-plans.ts` only has condensed text. Decide: fetch-and-render the full `.md` from `docs/build-kickoff/sample-plans/` at build time (e.g. via a Next.js content loader), or inline full text into a new data file instead of markdown files. Given the existing pattern (`EXAMPLES` is a flat TS array), inlining might be more consistent with how this codebase already works — your call.
2. **Whether this is static or backed by real Kickoff job rows.** Simplest v1: purely static content keyed by example name, no job table involvement, no re-run capability. If you want it richer (e.g. "regenerate this sample"), that's a bigger scope increase — flag it back to Shane rather than assuming.
3. **UI placement and copy.** This handoff proposes `KickoffPanel.tsx` but doesn't design the affordance. Keep the disclaimer language intact wherever it renders — "decision-support, not a validated design" and the critic-verdict badge are load-bearing for honesty, not decoration; see the disclaimer text at the top of each sample plan `.md` file.
4. **Tests.** None written. If you wire this in, it needs the same bar as the rest of the app (per `CLAUDE.md`): `tsc --noEmit` + vitest green before anything gets pushed.

## Non-goals for this ticket

- Does not touch the live Kickoff pipeline, worker, or job table.
- Does not change `EXAMPLES` in `src/lib/examples.ts`.
- Does not commit anything — per `CLAUDE.md`, Cowork edits files but never touches git; these files are sitting uncommitted for you to review, adjust, and fold into your next commit (or discard, if the idea doesn't hold up on review).
