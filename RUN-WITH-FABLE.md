# RUN WITH FABLE — building this repo in Claude Code

How to point Claude Code (Fable 5) at this repo and let it execute the briefs. Verified against Anthropic's current Claude Code model-config docs (code.claude.com/docs/en/model-config); check there if anything below has moved.

## 0. Prerequisites
- **Claude Code v2.1.170 or later** — Fable 5 doesn't appear in the picker below that. Run `claude update`, then `claude --version` to confirm.
- **Fable access + billing.** Fable 5 is never the default on any plan — you always opt in. It's a paid model at **$10 / $50 per million tokens (~2× Opus 4.8)**, so on a subscription it draws down your usage roughly twice as fast. It is **not available under zero-data-retention** (Fable traffic carries 30-day retention).
- **Do the credentials yourself first.** Fable can't create your Neon, Google, or Vercel accounts or hold your secrets. Complete `SETUP.md` Part A steps 2–4 (Neon URL, `AUTH_SECRET`, Google OAuth) so `.env` exists before you start.

## 0.5 Time-sensitive, Pro-plan-specific: do this before you start
Per Anthropic's own July 1 redeployment announcement, Fable 5 is included on Pro/Max/Team/select Enterprise plans for **up to 50% of weekly usage limits only through July 7, 2026** — after that it's usage-credits-only at standard API rates regardless of tier. If you're reading this on July 6 or 7, you're in the last window where Fable is plan-included at all.

On the **Pro plan specifically**, the weekly pool is the smallest of any paid tier — Anthropic's own help center positions Pro for short coding sprints, not a full-day multi-milestone build delegating across four subagents (multi-agent workflows are reported to consume noticeably more tokens than a single-agent session). Two things worth doing before you start, confirmed against Anthropic's help center:

1. **Enable usage credits now**, so a long session doesn't just stop mid-milestone: claude.ai (web, not the mobile app) → **Settings → Usage** → add a payment method → enable usage credits → set a monthly spending cap. This draws from pay-as-you-go billing only once you exceed your plan's included limit, and covers both claude.ai and Claude Code terminal usage under one setting.
2. **Optional — upgrade to Max 5x** via claude.ai/upgrade if you expect this intensity to continue past tomorrow. It's immediate and prorated, but it's a real monthly-plan commitment, not a one-day toggle — worth it if the delivery-kit work continues over several more sessions, less so for a single push where Pro + credits (pay only for actual overage) is cheaper.

**Given the model-per-milestone table below reserves Fable for M2 only**, the recommendation for a balanced approach is: **stay on Pro, enable usage credits with a moderate cap (e.g. $40)**, and treat Max as a mid-day escalation option rather than a pre-commitment. Concentrating Fable on one milestone instead of the whole day substantially cuts the risk that drove the original "will Pro be enough" question — the other milestones run on Opus/Sonnet, which aren't subject to Fable's 50%-of-weekly-limit cap and cost less per token to begin with (Opus $5/$25, Sonnet $3/$15, vs. Fable $10/$50 per million tokens). If M2 itself runs long or needs several Fable passes and Pro's pool feels tight mid-morning, upgrading then is a legitimate, immediate option — Anthropic's own docs confirm Pro→Max is instant and prorated, so there's no penalty to deciding that in the moment rather than pre-committing tonight.

Either way, the plan-with-Fable/execute-with-Opus pattern below matters more on Pro, since the 50% cap is Fable-specific and doesn't constrain Opus.

## 1. Open the repo in Claude Code
```bash
unzip use-case-studio-starter.zip && cd use-case-studio
git init && git add -A && git commit -m "starter"
claude
```

## 2. Select Fable 5
Inside the session:
```
/model fable
```
(`/model claude-fable-5` pins the exact version; `/model` with no argument opens the picker.) Confirm with `/status`. Selecting a model with `/model` also saves it as the default for new sessions.

## 3. Plan first, then execute
Fable is strongest when you hand it an outcome and let it plan the path, so split into a plan pass and an execution pass.

**Plan pass:**
```
Read README.md, FABLE-BRIEF.md, and FABLE-BRIEF-DELIVERY-KIT.md. Don't write code yet.
Inspect the repo, then write PLAN.md: milestones in order, risks, file boundaries,
and the exact verification command for each milestone. Commit it.
```

**Execution pass — switch models at each milestone boundary per the tables in both briefs:**
```
/model sonnet
Execute FABLE-BRIEF.md M0, then M1. Commit at each green checkpoint.
```
When M1 is done and committed:
```
/model fable
Execute M2 — the UI port — end to end. Visually compare against reference/ai-use-case-studio.jsx
per the brief's rule 2 before calling it done. Commit when it's stable.
```
When M2 is done and committed:
```
/model opus
Execute M3. Escalate only the share-link security design to Fable if it raises real uncertainty
— otherwise continue on Opus.
```
Then:
```
/model sonnet
Execute M4, M5, then FABLE-BRIEF-DELIVERY-KIT.md DK-1 through DK-5. Commit at each checkpoint.
```
(DK-1 defaults to Opus per its table — switch once if you want to follow that exactly, or leave it on Sonnet and see if it holds; it's a smaller milestone than M2 and the risk of leaving it on Sonnet is low.)

Stop and summarize after each milestone so you can review before the next model switch.

## 4. How to drive it well (from Anthropic's Fable guidance)
- **Describe the outcome, not the steps** — hand it the result and let it plan.
- **Set a goal so it keeps working until that outcome holds** — it sustains long autonomous runs.
- **Skip "remember to test / check your work" reminders** — it verifies its own work with less prompting; the briefs already require tests per milestone.
- **Size up the task** — give it a whole milestone, not a single edit. It holds the thread across long sessions.
- Hand it the ambiguous parts (the UI port in M2, the auth flow) rather than micromanaging.

## 5. Keep the bill in check
Because Fable is ~2× Opus and burns usage ~2× faster, two patterns help:
- **Plan with Fable, execute with Opus.** Do the plan pass on Fable, then `/model opus` and run the execution pass. Switch only at the plan boundary — changing model mid-session re-reads the full history once (a one-time token cost), so don't flip back and forth.
- **Four project subagents ship in `.claude/agents/`** (committed to the repo, so they're checked in and shared):
  - `implementer` (Sonnet) — executes one scoped plan step at a time.
  - `grunt-search` (Haiku, with WebFetch/WebSearch) — codebase search and live doc verification; returns conclusions only, never raw dumps.
  - `test-writer` (Sonnet) — writes/updates Vitest + Playwright tests.
  - `db-migration` (Sonnet) — Drizzle schema edits and migrations, reviews generated SQL before applying.

  Fable orchestrates and delegates to these automatically by matching your request against each agent's `description`, or you can call one directly: `Use the grunt-search subagent to confirm the current Auth.js v5 field name for the session callback.`

  **Honest limitation:** the `tools` field in each agent's frontmatter restricts *which tool types* it can use (Read/Write/Edit/Bash/etc.) — it does not restrict *which files or paths*. "test-writer only touches test files" and "db-migration only touches src/db/" are enforced by each agent's own system prompt, not a technical wall. Both files say this explicitly and are told to stop and hand back rather than silently expand scope. Review their diffs like you would any agent's.

Use `/status` before big runs to confirm the active model.

## 6. The fallback you'll occasionally see
Fable auto-routes requests its safety classifiers flag (most often cybersecurity/biology) to **Opus 4.8** — you'll see a "switched to Opus" notice. Anthropic reports **>95% of Fable sessions involve no fallback**, so for this app it's rare, but the MCP/security-hardening work elsewhere in your portfolio is the kind of thing that can trip it. If it happens mid-build, `/model fable` returns you to Fable for the next request.

## 7. Verify as you go
After each milestone: `npm run build`, `npm run test` (engine + delivery-kit suites already pass — keep them green), `npm run dev`. When M4 lands, deploy per `SETUP.md` Part B.

Note: subagent definitions load at session start. If you edit a file under `.claude/agents/` mid-session, restart the Claude Code session to pick up the change.

## 8. When it's blocked
The briefs tell Fable to stub any integration that needs a credential it can't create (marked `// BLOCKED: needs <credential>`), keep going on everything else, and list all blocks in its final report — so a missing key never fakes a passing integration.
