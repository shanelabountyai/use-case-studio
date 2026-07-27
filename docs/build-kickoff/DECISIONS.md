# Build Kickoff — Spike Decisions

## Status (2026-07-27): provider-independent foundation COMPLETE
Built + tested behind `KICKOFF_ENABLED` (off): BK-0 contracts/table · BK-2
serializer · BK-1 async plumbing+guards · BK-7 eval scaffold (deterministic
half) · BK-5 approve gate + Markdown export · BK-6 cost caps/ceilings/telemetry/
feedback. LLM stages are stubbed behind `provider.ts`. 224 tests green.

**Remaining P0 (needs the Anthropic key + spend):** BK-3 planner, BK-4 critic,
and the live half of BK-7 (LLM-judge validation + `criticFabricationGate`).

### Go-live checklist (do before flipping the feature on)
1. Apply migrations `0001`–`0003` to the target Neon DB (dev first): `npm run db:migrate`.
2. Set env vars (Vercel prod + local `.env`):
   - `ANTHROPIC_API_KEY` — the provider key (BK-3/BK-4).
   - `CRON_SECRET` — any random string; the worker rejects the cron without it.
   - `KICKOFF_ENABLED=true` — flips the trigger on (leave unset to keep dark).
   - Optional cap overrides: `KICKOFF_TOKEN_CAP` (60000), `KICKOFF_TIMEOUT_MS`
     (120000), `KICKOFF_MAX_CONCURRENT` (1), `KICKOFF_DAILY_CEILING` (20).
   - Optional `KICKOFF_KILL_SWITCH=true` to pause everything.
3. The `vercel.json` cron hits `/api/kickoff/worker` every minute (Vercel Pro).
4. Launch gate (BK-7): all deterministic tests green · golden invariants pass ·
   critic catches 100% of planted fabrications · LLM-judge validated vs human ·
   run-success ≥95% on the corpus.

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
