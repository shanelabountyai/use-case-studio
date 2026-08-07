# When ready to turn on Build Kickoff

The Build Kickoff feature is **fully built, verified, and currently dark** (off).
While dark it runs nothing and costs nothing. This file is the whole path from
dark → live. Full engineering detail lives in `docs/build-kickoff/DECISIONS.md`.

_Last verified: 2026-08-06 — both live launch gates pass; dev + prod DBs migrated._

---

## What it does
Turns an already-evaluated use case (BUILD/REFINE verdict) into a ready-to-execute
build plan — architecture, data pipeline, evaluation, governance, delivery
milestones — then a second AI critic audits it for fabricated benchmarks, fake
guarantees, and vendor lock-in before you see it. ~3 min, ~$0.40 per plan.

## Current state (dark)
- `KICKOFF_ENABLED` unset → feature invisible, no runtime, no cost.
- `vercel.json` cron is **daily** (`0 0 * * *`) so deploys stay green on Vercel Hobby.
- Runtime pipeline = planner + critic (both live gates verified). The LLM-judge is
  an eval/QA tool only — NOT in the runtime path, so it does not block go-live.

---

## Go-live checklist (in order)

1. **Vercel → Pro plan.** Required: the worker declares `maxDuration = 300` and the
   Opus-5 planner takes 2–3 min. Hobby caps functions at 60s and would kill every
   run mid-planner.

2. **Vercel env vars** (Settings → Environment Variables, Production):
   - `ANTHROPIC_API_KEY` — the API key (same one in local `.env`). Needs a positive
     **API credit balance** in console.anthropic.com (separate from claude.ai
     usage credits).
   - `CRON_SECRET` — must match the value in your local `.env`. Vercel sends it as
     the cron's `Authorization: Bearer …`; the worker rejects the cron without it.

3. **Cron → every-minute.** Change `vercel.json` to `"schedule": "* * * * *"` so a
   queued job drains within a minute instead of waiting up to 24h. **Do this only
   after step 1** — every-minute crons need Pro. (One-line change; ask Claude Code
   to make it.)

4. **`KICKOFF_ENABLED=true`** — in Vercel (prod) and local `.env`. This is the
   actual on-switch.

---

## Cost
- **Fixed:** Vercel Pro ~$20/month.
- **Per use:** ~$0.40 per plan generated (usage-based — $0 when unused).
- **Ceiling:** caps at 20 runs/user/day, 60k tokens/run — worst case ~$8/user/day,
  realistically a few $/week.
- **Cost lever:** set `KICKOFF_MODEL=claude-sonnet-5` to roughly halve per-run cost
  (~$0.15–0.20) with a modest quality trade-off.
- Keep a positive **API credit balance** in console.anthropic.com for production.

## Optional QA (after launch)
Validate the LLM-judge against ≥10 real hand-rated plans, then you can trust its
scores:
```
npx tsx scripts/judge-validate.mts emit    # generate plans to rate
# fill in each "humanScore" (1–5) in docs/build-kickoff/human-ratings.json
npx tsx scripts/judge-validate.mts check   # reports judge-vs-human agreement
```

## Re-run the live gates after any planner/critic prompt edit
```
env -u ANTHROPIC_API_KEY BK_LIVE=1 npx vitest run src/lib/kickoff/gate.live.test.ts
env -u ANTHROPIC_API_KEY BK_LIVE=1 npx vitest run src/lib/kickoff/runsuccess.live.test.ts
```
(`env -u ANTHROPIC_API_KEY` matters — a shell key shadows `.env` and 401s.)
