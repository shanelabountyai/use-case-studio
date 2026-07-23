# Build Kickoff — Phase 0 Engineering Ticket Breakdown

*Derived from `Build-Kickoff-PRD-v2.md`. Scope: the smallest shippable slice — **BUILD-only, `lookup`-only, async, 2-call topology**, behind a feature flag, with the eval gate as launch criterion. REFINE/`classify`/diff-view/PPTX are P1 and deliberately excluded here.*

Estimates are rough T-shirt sizes (S ≈ ≤1 day, M ≈ 2–3 days, L ≈ ~1 week) and are **estimates**, not commitments.

---

## Critical path & dependency graph

```
BK-S1 (provider/cost spike) ┐
BK-S2 (job-runner spike)     ┘→ BK-0 (contracts + migration)
                                   ├→ BK-1 (job plumbing + trigger + guards)
                                   ├→ BK-2 (grounding serializer)
                                   │      └→ BK-3 (Call-1 planner) → BK-4 (Call-2 critic)
                                   │                                     └→ BK-7 (eval harness / launch gate)
                                   └→ BK-1 ─┐
                          BK-4 + BK-1 ──────┴→ BK-5 (persistence + approval + export)
                                   BK-1 ─────→ BK-6 (cost caps + flag + telemetry)   [cross-cutting]
```

**Suggested build order:** S1/S2 → BK-0 → (BK-1 ∥ BK-2) → BK-3 → BK-4 → (BK-5 ∥ BK-6) → BK-7 (runs continuously; is the launch gate). BK-3 and BK-4 are the long poles.

**Definition of Done (applies to every ticket):** code + tests merged; deterministic tests in CI green; no secrets committed; `npm run typecheck` + vitest pass (test files excluded from prod type-check per repo convention); feature-flagged off by default; PR notes list which PRD-v2 P0 item(s) it closes.

---

## Spikes (close the two blocking Open Questions first)

### BK-S1 — Provider + cost confirmation *(spike, S)*
Confirm the hosted LLM (structured-output/JSON capable), and measure a real per-run cost for the **2-call topology** on the two prototype cases (planner ≈ one structured pass; critic ≈ one pass). Output: chosen model + params, measured input/output tokens and USD/run, and the recommended **per-run token cap, timeout, per-user concurrency + daily ceiling** numbers that feed BK-6.
- **Done when:** a one-page decision note with real numbers exists and the caps are chosen.

### BK-S2 — Job runner on Vercel + Neon *(spike, S)*
Decide the async execution mechanism given the current stack. Evaluate: a Neon-backed `job` table + cron/worker (least new infra) vs. a durable queue service. Output: chosen mechanism, how a worker is invoked, retry/visibility semantics, and how "notify" works (poll vs push).
- **Done when:** mechanism chosen with a short rationale; BK-1 can be written against it.

---

## BK-0 — Contracts & schema foundation *(M)* · closes: data-contract prerequisite for P0.3/P0.4/P0.8
Shared Zod schemas + the persistence migration. No LLM calls.

**Scope (in):**
- A shared module exporting `GroundingInput`, `IntegratedPlan` (incl. the `REFINE ⇒ refineGate` superRefine), `CriticAudit`, `BuildKickoffPlan` (verbatim from PRD v2 Data Contracts), with inferred TS types.
- Drizzle migration for a new **`build_kickoff_plan`** table: `id`, `case_id` (fk → use_case, cascade), `user_id` (fk → user), `version` (int, per case), `status` (enum), `plan` (jsonb, nullable), `audit` (jsonb, nullable), `lane_status` (jsonb), `provenance` (jsonb), `cost` (jsonb, nullable), `approved_at` (timestamp, nullable), `created_at`. Indexes on `(case_id, version)` and `(user_id)`.
- Migration applied to dev Neon; **not** run against prod in this ticket.

**Scope (out):** any read/write logic (BK-5), any LLM code.

**Acceptance criteria:**
- [ ] All four schemas exported; `IntegratedPlan.parse` rejects a REFINE plan lacking `refineGate` and a non-REFINE plan carrying one.
- [ ] `npm run db:generate` produces the migration; `db:migrate` succeeds on dev; table matches the schema.
- [ ] Types are importable app-wide; no circular import with `engine.ts`.

**Tests:** schema unit tests (valid fixture passes; each required-field omission fails; the two superRefine cases; extra-field rejection where `.strict` intended). Migration smoke test.

---

## BK-1 — Async job plumbing, trigger & pre-dispatch guards *(L)* · closes: P0.1, P0.2, P0.4 (routing), P0.10 (contract), P0.11 (PII), part of P0.12 (flag)
The request path and orchestration skeleton (LLM calls are stubbed here; wired in BK-3/BK-4).

**Scope (in):**
- `POST /api/kickoff` (owner-scoped): loads the case, **re-derives verdict server-side** (never trusts client), runs the **inputs-completeness pre-check** (acceptance bar present? data sources named? sensitivity set? taskShape resolvable?) → `422` with the fields to fix on failure, **no job created**.
- **PII confirm gate:** if `dataSensitivity ∈ {pii, regulated}` or a detector hits case free-text, require an explicit `confirmSendToProvider: true` in the request; otherwise `409` needs-confirmation.
- **Verdict routing:** `PARK` → short "what would move this to BUILD" note (deterministic, from weakest dims + flags), persisted, **no LLM call, no spend**. `BUILD` (P0) → enqueue job. (`REFINE` path stubbed → 501 in P0; enabled in P1.)
- Job lifecycle: create row `status=queued` → worker sets `running` → terminal `complete|partial|failed`. Worker orchestrates: serialize (BK-2) → Call 1 (BK-3 stub) → Call 2 (BK-4 stub) → hand to persistence (BK-5).
- `GET /api/kickoff/:jobId` (owner-scoped) returns status + result when ready.
- **Partial-lane contract:** a typed `laneStatus` map is threaded through; a failed/timed-out stage marks the lane and yields `status=partial` (never silently complete).
- Feature-flag check at the trigger (kill switch detail in BK-6).

**Scope (out):** real LLM calls, cost enforcement internals (BK-6), persistence write shape (BK-5).

**Acceptance criteria:**
- [ ] *Given* a thin case (no acceptance bar), *when* triggered, *then* `422` with the missing fields and **no job row created**.
- [ ] *Given* a PII case without `confirmSendToProvider`, *then* `409`; with it, job proceeds.
- [ ] *Given* a PARK case, *then* a note is returned, **no LLM call is made** (assert via stub call-count = 0), no spend.
- [ ] *Given* a valid BUILD case, *then* `202` + `jobId`; polling transitions queued→running→complete.
- [ ] Owner A cannot trigger or read a job for owner B's case (`403/404`).
- [ ] A stubbed stage failure yields `status=partial` with the failed lane marked.

**Tests:** route tests for pre-check/PII/PARK/BUILD/auth; verdict re-derivation overrides a tampered client `verdict`; orchestration state-machine unit tests; partial-lane on injected stage failure.

---

## BK-2 — Grounding serializer *(M)* · closes: serializer half of P0.5; enables case-specific output
Pure function `serializeGrounding(useCase, evaluation, recs) → GroundingInput`.

**Scope (in):**
- Map engine outputs (`UseCase`, `evaluate()`, `recArchitecture/recDataAccess/recTesting/CRISP`) into `GroundingInput`, pinning `recommendation.architecturePattern` and pulling `acceptanceBar` out explicitly.
- Deterministic, side-effect-free; stable field ordering; a documented token-budget ceiling on `useCase` free-text (truncate + label if exceeded).
- The PARK-note generator (used by BK-1) lives here as a sibling pure function.

**Acceptance criteria:**
- [ ] Golden-output test: fixed engine input → exact `GroundingInput` (byte-stable).
- [ ] Output validates against the `GroundingInput` schema for both prototype cases.
- [ ] `architecturePattern` equals `recArchitecture(uc).pattern`.

**Tests:** golden-output tests on both prototype cases; truncation path; PARK-note generator output on a PARK fixture.

---

## BK-3 — Call 1: Planner *(L)* · closes: P0.3 (planner), P0.5 (template + match)
One structured LLM pass that plays the five specialist lanes + integrator, emitting a validated `IntegratedPlan`.

**Scope (in):**
- Provider client (from BK-S1) with structured-output/JSON.
- The **`lookup`/RAG planner prompt** (P0 template only) carrying the guardrails (acceptance-bar spine, label estimates, no fabricated benchmarks/vendors, decision-support-not-guarantee), grounded by `GroundingInput`.
- Parse → validate against `IntegratedPlan`; **retry once** on schema-invalid output with the validation errors fed back; on second failure → mark lane failed (→ partial via BK-1).
- **Architecture-family match** assertion: `plan.architecturePattern` matches `recommendation.architecturePattern` family, else flagged.
- Emit token/latency for telemetry (BK-6).
- `promptRosterVersion` constant defined here and surfaced to provenance.

**Scope (out):** the critic (BK-4); persistence (BK-5); `classify`/other templates (P1).

**Acceptance criteria:**
- [ ] On both prototype BUILD-ish `lookup` inputs, returns a schema-valid `IntegratedPlan` with all required sections, ≥1 data flow, ≥1 milestone.
- [ ] Malformed model output triggers exactly one retry, then a labeled partial.
- [ ] Architecture-family match holds; a forced mismatch is flagged, not silently accepted.
- [ ] No client verdict trusted; plan echoes the server verdict.

**Tests:** schema-conformance against recorded fixtures; retry-once behavior with a stubbed bad-then-good provider; architecture-match unit test; guardrail structural checks feed BK-7. (LLM calls mocked in unit tests; live calls only in the BK-7 eval harness.)

---

## BK-4 — Call 2: Critic *(M)* · closes: P0.6
An **independent** second call auditing the plan.

**Scope (in):**
- Separate provider call receiving **only** `IntegratedPlan` + `GroundingInput` — never Call 1's reasoning/messages (independence is the product value).
- The critic prompt = the 7-point checklist; output parsed → `CriticAudit` (retry-once).
- Wire so a plan is **never surfaced or approvable without** a completed audit (or an explicit "audit-failed" state that blocks approval).

**Acceptance criteria:**
- [ ] Produces a schema-valid `CriticAudit` with a verdict ∈ {SHIP AS-IS, SHIP WITH FIXES, NEEDS REWORK} and ≤3 fixes.
- [ ] The critic call receives no planner internal state (assert the payload shape).
- [ ] A plan with no/failed audit cannot reach `complete`/approvable state.

**Tests:** schema conformance; independence-payload assertion; "no audit ⇒ not approvable" integration test; the planted-fabrication sensitivity set is defined in BK-7 and gated there.

---

## BK-5 — Persistence, approval gate & export *(M)* · closes: P0.7, P0.8, P0.9, P0.13
Write the record, enforce draft→approve, gate export, bind disclaimer + audit.

**Scope (in):**
- Persist `BuildKickoffPlan` (plan + audit + `laneStatus` + `cost`) with a full **provenance** block (engine-outputs hash, `promptRosterVersion`, model+params, verdict-at-generation, caseVersion); assign per-case `version`.
- `status` transitions incl. `complete → approved` via `POST /api/kickoff/:id/approve` (owner-scoped); `approved_at` set.
- **Export** (`GET /api/kickoff/:id/export.md`) returns a single Markdown artifact of plan **+ attached critic audit + the decision-support disclaimer**, and **403s unless `status=approved`**. Disclaimer + audit are bound at the render/data layer so no path emits a plan without them.
- Partial/non-approvable plans cannot be approved or exported.

**Acceptance criteria:**
- [ ] *Given* a completed draft plan, export APIs `403` until `approve` is called; after approval they return the Markdown.
- [ ] Every export contains the disclaimer and the critic audit (assert presence).
- [ ] Provenance round-trips and uniquely identifies the producing engine outputs + prompt version.
- [ ] A `partial` plan cannot be approved.

**Tests:** approval-gate route tests (pre/post approval); export-contains-disclaimer+audit assertion; provenance round-trip; partial-not-approvable; auth scoping on approve/export.

---

## BK-6 — Cost controls, kill switch & telemetry *(M, cross-cutting)* · closes: P0.12, P0.14
Safety and observability around the worker.

**Scope (in):**
- Enforce in the worker: **per-run input+output token cap** and **wall-clock timeout** (abort → labeled partial, not runaway); **per-user concurrency limit + daily run ceiling** (reject at trigger with a clear message).
- **Feature flag + kill switch:** flag gates the trigger; kill switch (a) blocks new runs, (b) fails in-flight runs cleanly, (c) surfaces a visible "Build Kickoff is paused" state — never a silent 500.
- **Telemetry:** per-run + per-call events (run id, tokens, latency, cost USD, failure reason) written for the Success-Metric queries.
- **Inline feedback hook:** endpoints to capture "was this gap real?" per critic finding, "flag a fabrication," and a usable/not rating — the seed of the eval corpus.

**Acceptance criteria:**
- [ ] A run injected over the token cap or past timeout **aborts** and persists `partial` with the reason; no unbounded spend.
- [ ] Flipping the kill switch mid-run fails it cleanly and shows the paused state; new triggers are refused.
- [ ] Exceeding per-user concurrency/daily ceiling returns a clear `429`.
- [ ] Telemetry rows exist for a completed run; feedback endpoints persist owner-scoped ratings.

**Tests:** cap/timeout abort tests (stubbed over-budget run); kill-switch mid-run; ceiling `429`; telemetry-written assertion; feedback persistence + auth.

---

## BK-7 — Eval harness & launch gate *(L, runs continuously)* · closes: PRD-v2 Testing & Eval Plan; **the launch gate**
The non-deterministic-output safety net; also the prompt-regression gate.

**Scope (in):**
- **Golden corpus:** the two prototype cases + a PARK + a thin case (P0 set; task-shape cases arrive with P1 templates). Store inputs + recorded reference outputs.
- **Structural invariant checks** on plan output: must-include (acceptance bar used as spine; taskShape eval vocabulary present; well-formed critic verdict) and must-NOT-include (bare `%`/`$`/`ms`/vendor tokens without an "estimate"/example label; guarantee words flagged).
- **Planted-fabrication set:** plans with injected fabrications (fake benchmark, vendor-as-requirement, unlabeled SLA, silent verdict downgrade) — the critic **must** catch each. A miss is **launch-blocking**.
- **LLM-as-judge**, validated against human ratings on a subsample before trusted; report pass-rate per invariant.
- **Prompt-regression gate:** any change to a planner/critic prompt bumps `promptRosterVersion` and re-runs the corpus + planted set as a merge gate.
- **Model-drift canary:** scheduled corpus re-run to catch silent provider updates.

**Acceptance criteria:**
- [ ] Corpus + planted set runnable via one command; produces a per-invariant pass-rate report.
- [ ] Critic catches 100% of planted fabrications (hard gate).
- [ ] A prompt edit that flips any invariant fails the gate.
- [ ] LLM-judge agreement vs. human on the seed set is measured and recorded.
- [ ] **Launch gate assembled:** all deterministic tests green · golden invariants pass · 100% planted-fabrication catch · judge validated · run-success ≥95% on the corpus.

**Tests:** the harness *is* the test suite; add self-tests for the invariant detectors (a known-fabricated string is flagged; a properly-labeled estimate is not).

---

## Coverage check — every PRD-v2 P0 has a home
P0.1 async → BK-1 · P0.2 pre-check → BK-1 · P0.3 2-call+schema → BK-3/BK-4 (+BK-0) · P0.4 verdict gating → BK-1/BK-2 · P0.5 lookup+match → BK-2/BK-3 · P0.6 critic attached → BK-4 · P0.7 approve gate → BK-5 · P0.8 provenance → BK-5 (+BK-0) · P0.9 disclaimer/audit bound → BK-5 · P0.10 partial-lane → BK-1 · P0.11 PII → BK-1 · P0.12 cost/flag/kill → BK-6 · P0.13 Markdown export → BK-5 · P0.14 telemetry+feedback → BK-6 · Testing gate → BK-7.

## Not in Phase 0 (P1+, tracked separately)
REFINE gating (BK-1 stub → enable) · `classify` + other templates · accept-critic-fix · version diff view · Deliver-tab + PPTX integration · pre-run cost estimate UI · cache · scaffold-to-repo · 7-call fan-out experiment. The UI surface (7th stage vs Deliver action vs export) is a separate design/UI ticket — the P0 above is fully exercisable via the API + Markdown export behind the flag.
