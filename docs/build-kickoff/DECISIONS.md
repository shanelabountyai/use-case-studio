# Build Kickoff — Spike Decisions

## Status (2026-07-27): provider-independent foundation COMPLETE
Built + tested behind `KICKOFF_ENABLED` (off): BK-0 contracts/table · BK-2
serializer · BK-1 async plumbing+guards · BK-7 eval scaffold (deterministic
half) · BK-5 approve gate + Markdown export · BK-6 cost caps/ceilings/telemetry/
feedback. LLM stages are stubbed behind `provider.ts`. 224 tests green.

### Status (2026-07-31): LLM stages live behind the flag
BK-3 planner + BK-4 critic implemented on the Claude API (`@anthropic-ai/sdk`,
structured output validated against the contracts.ts Zod schemas, one retry on a
schema miss). `criticFabricationGate` (BK-7 live half) wired to the real critic.
Routed via `provider.getProvider()` — real stages only when `KICKOFF_ENABLED` +
`ANTHROPIC_API_KEY`, else stubs. Still dark. 224 tests green, build clean.

**Measured run (BK-3 requirement)** — `claude-opus-5`, effort medium, invoice-
classify fixture (REFINE): planner 4.8k in / 9.4k out, critic 14.1k in / 4.4k
out → **~$0.44/run**, ~33k tokens (well under the 60k cap). Latency: planner
alone exceeded 120s → timeout default raised
to **280s** (fits the worker's 300s maxDuration). Cost/latency levers if needed:
`KICKOFF_MODEL=claude-sonnet-5` or a lower effort in `claude.ts`.

### Measured run — policy-lookup (BUILD), 2026-08-03
The outstanding half of the BK-3 cap numbers (`claude-opus-5`, effort medium):

| stage | in | out | latency |
|---|---|---|---|
| planner | 4,641 | 8,440 | 121.1s |
| critic | 12,997 | 3,018 | 40.3s |
| **total** | **29,096 tokens** | | **161.4s** |

**~$0.37/run**, vs ~$0.44 for invoice-classify (REFINE). Both sit at roughly
half the 60k token cap and inside the 280s timeout, so **the caps stand as set**
— no change needed. Critic verdict: SHIP WITH FIXES. Note the planner alone took
121s, well past Hobby's 60s function cap (see the go-live checklist).

**Open defect — `no-guarantees` invariant is over-broad.** The live plan failed
it on *"audience-restricted content filters can be enforced if any exist"* —
correctly-hedged engineering prose, not an overclaim. The regex lists `enforced`,
`ensure[sd]?`, and `prevents?` alongside real overclaim phrases, and those are
ordinary security verbs ("access controls are enforced at the retrieval layer").
An earlier run failed on `guarantee`/`guaranteed`, context not captured.

This blocks the launch gate's "run-success ≥95% on the corpus" criterion: if the
invariant fires on honest plans, no real run passes, and the check trains people
to ignore it. Proposed fix — keep unambiguous overclaims standalone (`guarantee*`,
"never fails", "100% accurate", "zero errors") but require an absolute quantifier
immediately after the softer verbs (`prevents any`, `ensures no`, `enforces all`).
The planted `guarantee` fabrication still trips on "guarantees zero errors …
prevents any leakage". **Not applied — it is a product-standards call.**

### Status (2026-08-03): fabrication gate PASSES on both corpus cases
The earlier "gate 5/5 (PASS)" was scored under logic that could not fail — a
catch counted if the critic merely returned a non-clean verdict, so a critic
answering "SHIP WITH FIXES" to everything scored 100% while detecting nothing.
**Disregard that result.** Scoring now requires the critic to NAME the planted
text (`99.9%` / `50ms` / "zero errors" / Pinecone), plus a clean-plan control it
must not condemn — sensitivity and specificity, not just sensitivity.

Re-run live under the strict scoring (`claude-opus-5`, effort medium):

| corpus case | planted | control | result | latency |
|---|---|---|---|---|
| policy-lookup (BUILD) | 4/4 named | clean | **PASS** | 61s |
| invoice-classify (REFINE) | 5/5 named (incl. verdict drift) | clean | **PASS** | 160s |

Two harness defects surfaced and were fixed getting here:
- `silent-downgrade` was planted on BUILD groundings where the mutation is a
  no-op (planted plan byte-identical to the control), demanding the critic catch
  a fabrication that wasn't there. Now planted only where the drift is real.
- `basePlan` hardcoded RAG prose for every grounding while taking
  `architecturePattern` from the grounding, so the classify control described
  retrieval for a classification task. The live critic correctly condemned it —
  a true positive that read as a false one. The body now follows `taskShape`.

Re-run the gate after any prompt edit (`PROMPT_ROSTER_VERSION` bump):
`env -u ANTHROPIC_API_KEY BK_LIVE=1 npx vitest run src/lib/kickoff/gate.live.test.ts`
(the `env -u` matters — dotenv does not override an exported shell key; a stale
one shadows `.env` and 401s). ~$2/run, ~4 min.

**BK-7 LLM-judge (2026-07-31):** `judge.ts` — `judgePlan` scores a plan 1–5 on
groundedness/actionability/barAlignment/honesty/overall; `judgeAgreement` +
`validateJudge` measure judge-vs-human agreement and gate `trusted` on MAE ≤ 1.0,
within-1 ≥ 0.8, Pearson ≥ 0.5, n ≥ 10 (`JUDGE_TRUST`). Judge stays untrusted
until validated. Live smoke: on a fabrication-laden plan it scored honesty 1/5
and its rationale caught the "guarantees zero errors" overclaim + a grounding
mismatch. 242 tests green, build clean.

**Remaining P0 (data/ops, not code):**
- Collect a human-rated plan set (≥10) and run `validateJudge` to clear the judge
  gate — only then lean on the judge.
- Apply migrations `0001`–`0003` to dev Neon; mirror `ANTHROPIC_API_KEY` +
  `CRON_SECRET` to Vercel (Pro); then set `KICKOFF_ENABLED=true`.

### Go-live checklist (do before flipping the feature on)
1. Apply migrations `0001`–`0003` to the target Neon DB (dev first): `npm run db:migrate`.
2. Set env vars (Vercel prod + local `.env`):
   - `ANTHROPIC_API_KEY` — the provider key (BK-3/BK-4).
   - `CRON_SECRET` — any random string; the worker rejects the cron without it.
   - `KICKOFF_ENABLED=true` — flips the trigger on (leave unset to keep dark).
   - Optional overrides: `KICKOFF_TOKEN_CAP` (60000), `KICKOFF_TIMEOUT_MS`
     (280000 — raised from 120000 after the BK-3 measured run), `KICKOFF_MODEL`
     (`claude-opus-5`), `KICKOFF_MAX_CONCURRENT` (1), `KICKOFF_DAILY_CEILING` (20).
   - Optional `KICKOFF_KILL_SWITCH=true` to pause everything.
3. **Vercel plan + cron — both required, neither enforced in code.** The runtime
   assumes Pro: `worker/route.ts` declares `maxDuration = 300` and a run's wall-
   clock budget is 280s (Opus-5's planner measured at 2–3 min). Hobby caps Node
   functions at **60s**, so a live run there is killed mid-planner and never
   completes — permanent `partial`. Before flipping the flag on:
   - **Upgrade to Vercel Pro** (for `maxDuration: 300` + the 280s planner budget).
   - **Set the cron back to every-minute** in `vercel.json` (`* * * * *`). It is
     currently **daily** (`0 0 * * *`, commit 38f5bc5) so the app deploys clean on
     Hobby while kickoff is dark — but daily means a queued job waits up to 24h.
4. Launch gate (BK-7): all deterministic tests green · golden invariants pass ·
   critic catches 100% of planted fabrications (`BK_LIVE=1 vitest gate.live.test.ts`)
   · LLM-judge validated vs human (`scripts/judge-validate.mts`) · run-success
   ≥95% on the corpus.

---


Running record for BK-S1 (provider/cost) and BK-S2 (job runner). Each entry is a
recommendation + the decision once Shane confirms. Nothing downstream (BK-0…BK-7)
starts until the decision line is filled in.

---

## BK-S2 — Async job runner  ·  status: **DECIDED 2026-07-24**
> **Decision:** DB-backed queue (the `build_kickoff_plan` row is the job) drained by a
> **Vercel Cron** worker. Vercel plan confirmed **Pro (300 s)** → **single-shot worker**
> (whole 2-call pipeline in one invocation; no step-worker needed). Poll-based status.
> Runner columns (`attempts`, `lease_until`) get added in BK-1.


### Recommendation: the `build_kickoff_plan` row *is* the job; a Vercel Cron worker drains the queue

No new infrastructure, no new dependency, no new secret. The record BK-0 already
has to create doubles as the job:

```
POST /api/kickoff
  → pre-check + verdict re-derive (deterministic, no spend)
  → INSERT build_kickoff_plan (status='queued', attempts=0, lease_until=null)
  → 202 { jobId }              # returns immediately

Vercel Cron  (*/1 * * * *  → GET /api/kickoff/worker, protected by CRON_SECRET)
  → atomically CLAIM one row:
      UPDATE build_kickoff_plan
         SET status='running', lease_until=now()+interval '5 min', attempts=attempts+1
       WHERE id = (SELECT id FROM build_kickoff_plan
                    WHERE status='queued'
                       OR (status='running' AND lease_until < now())   -- reclaim dead leases
                    ORDER BY created_at LIMIT 1
                    FOR UPDATE SKIP LOCKED)          -- see driver note below
      RETURNING *;
  → run pipeline: serialize → Call 1 → Call 2 → persist (status complete|partial|failed)

GET /api/kickoff/:jobId   → poll status + result   (no push; poll is enough at P0)
```

**Why this over a durable queue (QStash / Inngest / Vercel Queues):** those are the
"correct on paper" answer, but each adds an external account, a secret, and a webhook
surface for a feature that, at P0, runs a handful of jobs for a single practitioner.
The DB-backed queue reuses Neon + Drizzle + Vercel Cron (all already here) and is a
~40-line worker. If throughput ever outgrows one practitioner, swap the claim query
for a real queue behind the same `/api/kickoff` trigger — the trigger contract doesn't
change. *(ponytail: single-worker DB queue; graduate to a durable queue only if
concurrency/throughput demands it.)*

**Retry / visibility semantics:** `attempts` + `lease_until` on the row. A worker that
dies mid-run leaves a stale `running` lease; the next cron tick reclaims it (`lease_until
< now()`). Cap at `attempts >= 3 → status='failed'`. This is the whole retry story — no
dead-letter infra.

**"Notify" = poll.** `GET /api/kickoff/:jobId`. Push (SSE/websocket) is not worth it over
neon-http at P0; the UI polls every few seconds while status ∈ {queued, running}.

### The one real risk — and why it's coupled to BK-S1

A single Cron invocation runs the **whole** 2-call pipeline, so the worker must finish
inside Vercel's function `maxDuration`. That ceiling depends on the plan:

- **Hobby:** 60 s hard cap. If a 2-call run can exceed ~60 s, a single-invocation worker
  will time out.
- **Pro:** 300 s default (up to 800 s with Fluid Compute). Comfortable for a 2-call run.

If runs can breach the ceiling, the fallback is a **step worker**: each cron tick advances
the job one stage (`queued→serialized→planned→critiqued→complete`), one LLM call per
invocation. Same table, same trigger — just a `stage` column and an early return between
calls. Slightly more code; removes the duration ceiling entirely.

**→ Decision needed from Shane (two lines):**
1. **Vercel plan** = Hobby or Pro?  (Sets the maxDuration ceiling → single-shot worker vs. step worker.)
2. **OK to use Vercel Cron** (config-only, in `vercel.json`), or do you specifically want a durable queue despite the added infra?

Default if you just say "your call": **Pro assumed, single-shot worker, Vercel Cron.**
If Hobby, I flip to the step worker automatically.

---

## BK-S1 — Provider + cost  ·  status: **PROVIDER DECIDED 2026-07-24 · caps pending a measured run**
> **Decision:** **Claude API** (Anthropic), structured output via tool-use. New secret
> `ANTHROPIC_API_KEY` (set in Vercel + local `.env` before BK-3 runs live). Model choice +
> real USD/run + final caps confirmed during BK-3 against the two prototype cases.
> Proposed starting caps (tune after measuring): **60k tok/run · 120 s timeout ·
> concurrency 1 · 20 runs/day**.

What remains for BK-3/BK-4 (real calls):

1. **Provider + model.** Given this is an Anthropic shop, default recommendation is the
   Claude API with a current model (structured-output via tool-use / JSON). Confirm, or name
   another provider. New secret: `ANTHROPIC_API_KEY` (or provider equivalent).
2. **Caps** (feed BK-6). Propose, adjust as you like:
   - per-run token cap (input+output) — starting proposal **60k tokens**
   - per-run wall-clock timeout — **120 s** (fits Pro; drop to 45 s + step worker on Hobby)
   - per-user concurrency — **1**; daily run ceiling — **20**
3. I'll produce the real USD/run number by running the two prototype cases through the
   chosen model during BK-3 — the caps above get corrected against measured tokens then.

The provider is stubbed behind an interface in BK-1, so **BK-0 → BK-2 → BK-1 (stubbed) →
BK-7 scaffold all proceed without this decision.** BK-1 is where I'll pause for it.
