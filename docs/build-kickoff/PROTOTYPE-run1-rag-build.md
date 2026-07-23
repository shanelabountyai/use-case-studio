# Build Kickoff — Multi-Agent Swarm Prototype

*A working prototype of the "verified use case → implementation plan" agent pipeline, run end-to-end on a real AI Use-Case Studio output.*

## What this is

You asked whether a swarm of agents could pick up a **verified** studio output and produce an implementation recommendation with workflow, step-by-step instructions, data flows, and testing plans. This document is the actual output of that pipeline, run once, so you can judge it on evidence rather than a spec.

**Input (the verified case):** the studio's pinned worked example — *Internal policy & knowledge assistant* — which the engine scored **77/100, BUILD, "Quick win,"** task shape `lookup` → recommended architecture **RAG**. The agents were handed the case's real fields, scores, and the studio's computed architecture/data/test recommendations as grounding — they *expand* verified facts, they don't invent from scratch. That grounding is what makes the swarm safe here.

**The roster (bounded, not open-ended):**

1. Architecture specialist → components + data flows
2. Data/engineering specialist → ingestion pipeline + connectors
3. Evaluation & testing specialist → golden set, scoring, red-team
4. Governance/security specialist → permission-aware retrieval, HITL, NIST-RMF
5. Delivery specialist → one-builder / one-quarter milestone plan
6. **Integrator** → merges the five, de-duplicates, resolves conflicts
7. **Critic/verifier** → independent audit against the case + the studio's no-fabrication guardrails

The five specialists ran in parallel; the integrator then the critic ran in sequence. Every agent carried the studio's guardrails: no fabricated benchmarks/vendors/ROI, all estimates labeled, the acceptance bar (≥90% correct-with-citation, zero fabrication) as the spine.

**Run stats (this run):** 7 agents, ~249k subagent tokens total, ~5 min wall-clock (specialists parallel).

---

# Part 1 — Integrated Implementation Plan

## Executive Summary

The verdict on the internal policy & knowledge assistant is **BUILD**, and this plan sequences one builder over one quarter (~12–13 weeks, all durations estimates) to deliver it. In one line: a retrieval-augmented generation (RAG) system over the internal SharePoint policy corpus that answers employee policy questions **only** from retrieved passages and always attaches machine-checkable citations. Two invariants are non-negotiable and define the whole build: (1) **≥90% correct-with-citation** on a fixed 100-question golden set authored and rated by HR, and (2) **zero fabrication and zero leakage of salary bands or individual HR records**. The shape of the quarter is **eval-first**: the scoring harness is built in Week 1, before any retrieval code, so every later decision is measured against the acceptance bar rather than argued. Data preparation — not modeling — is the schedule-dominating risk (data readiness 3/5), so it is front-loaded and holds first claim on the buffer. Zero-fabrication is enforced structurally by two independent gates (retrieval must return relevant chunks; a post-generation validator must confirm every citation resolves to a retrieved passage), and leakage is prevented structurally by permission-aware, fail-closed retrieval plus ingestion-time exclusion of sensitive content. Rollout is staged shadow → limited, gated on the same bar, with a pre-committed rollback trigger; full org-wide rollout is explicitly out of scope for the quarter. The acceptance bar is the spine of the plan: no estimate, vendor, or benchmark below is invented, and everything speculative is labeled an estimate.

## Architecture & Data Flows

The system is a retrieval-augmented generation (RAG) pipeline. Answers are grounded in the SharePoint policy corpus and always carry citations, so the assistant stays current as documents change **without any retraining**.

**Components:**
- **Ingestion & indexing pipeline (offline)** — connectors pull policy PDFs and handbook pages from SharePoint plus curated FAQ Slack threads; a parser extracts text; a chunker splits into passages with metadata (source title, URL/path, section, version, last-modified, **access scope**); an embedding model vectorizes. Detailed in *Data Pipeline & Connectors*.
- **Vector index + metadata store** — holds chunk vectors plus provenance; metadata is filterable, including the sensitivity and access-scope fields that keep salary-band/HR-record chunks out of results.
- **Retriever** — returns top-k with source metadata, applying the permission and sensitivity filters *before* ranking (mechanism owned by *Governance, Security & Human-in-the-Loop*).
- **Generator** — a hosted LLM with structured output, prompted to answer only from retrieved passages and emit an answer plus machine-readable citations.
- **Citation/grounding + refusal layer** — the zero-fabrication enforcement point (defined once below).
- **Orchestration** — sequences retrieve → generate → validate → return, with full logging.

**Refusal & grounding logic (single source of truth — cross-referenced by Evaluation, Governance, and Delivery).** Zero-fabrication is enforced in **two independent gates**:
- **Gate 1 — retrieval sufficiency:** the retriever must return relevant chunks. Empty or low-confidence retrieval → **refuse before generation** ("I couldn't find this in policy — contact HR/IT").
- **Gate 2 — grounding validation:** the generator is constrained to retrieved passages and returns structured citations; a post-generation validator programmatically confirms each cited ID was actually in the retrieved set and that each claim maps to a retrieved chunk. Any citation that doesn't check out → the answer is rejected and converted to a **refusal**.

This "refuse rather than fabricate" behavior is the same abstention the Evaluation red-team suite tests, the same decline path Governance falls back to on a permission miss, and the same "answer only from context else abstain" instruction the Delivery thin-slice ships in Week 4–5.

**Data flow 1 (offline, scheduled):** SharePoint PDFs + handbook / Slack FAQs → parse & extract → chunk + metadata & version → sensitivity/permission tagging drops or segregates salary/HR chunks → embed → vector index. Runs on a periodic freshness cadence.

**Data flow 2 (online):** user question → embed query → retriever top-k with permission + sensitivity filter → **[no/low-confidence hits → REFUSE (Gate 1)]** → generator answers from passages + citations → grounding validator **[fails → REFUSE (Gate 2)]** → answer **with** citations → user; interaction logged.

**Performance (estimates):** retrieval is tens of ms; LLM generation dominates. Keep k small, cap output tokens, stream, and add a semantic cache on common repeats.

**Model choices at category level (no specific vendor named):** embedding model, vector index with metadata filtering, hosted LLM with structured output, SharePoint/Slack connectors. No training.

## Data Pipeline & Connectors

This stage moves policy content from SharePoint + Slack FAQ threads into a permission-aware vector index for cited, non-fabricated answers. With one builder / one quarter and data readiness 3/5, **this stage is the schedule-dominating risk**.

- **Step 0 — Sample and inspect by hand FIRST.** Pull 20–30 representative files; check scanned-vs-text PDFs (OCR needed?), structure consistency, boilerplate, duplicates/superseded versions, and whether "last-updated" is reliable. This sets realistic estimates and usually reveals prep is the true cost. *Pulled into Week 1 alongside the eval scaffold.*
- **Step 1 — Connect.** SharePoint API read-only, capturing each item's **permission scope**; Slack FAQ channels/threads with context.
- **Step 2 — Extract/parse.** PDFs + handbook → clean text preserving section boundaries and page numbers for citations; OCR scanned docs; reconstruct Slack Q&A pairs from threads.
- **Step 3 — Clean.** Strip headers/footers/nav/boilerplate; normalize; drop duplicates; **FLAG (not delete)** salary/HR content for exclusion review (exclusion policy lives in *Governance*).
- **Step 4 — Chunk with metadata.** Split on natural section breaks; attach source doc (title + link/ID), section/page, last-updated, and **access scope** (from Step 1). This lineage makes citations and zero-fabrication possible; the access-scope field is consumed by permission-aware retrieval.
- **Step 5 — Embed and load** into the vector index with metadata as filterable fields; store a source pointer for citations.

**Periodic refresh.** Re-index on cadence plus on-demand; detect change via modified-dates/versions; re-embed changed docs, and **remove deleted/superseded** so stale content can't be retrieved; surface last-updated and prefer current versions. (Automatic SharePoint change-sync is out of scope — this is periodic re-ingest.)

**Open data questions to resolve in Step 0 / W1–W3:** SharePoint permission-model mapping; PDF/OCR quality; whether Slack FAQs are authoritative and worth v1; where sensitive records live and the exact exclusion rule; whether "last-updated" is trustworthy.

## Evaluation & Test Plan

Designed backwards from the contract: **≥90% correct-with-citation on the 100-Q set; zero fabrication.** The harness is built in Week 1 (eval-first).

**Golden set.** Composed by type — ~55 routine, ~20 known-edge, ~15 deliberately-hard, ~10 out-of-scope/should-refuse (including salary/HR queries the assistant must decline); *proportions are an illustrative estimate*. **HR reviewers author the questions and gold answers with source references and own the rating.** The set is versioned and grows from production failures as permanent regression cases.

**Scoring correct-with-citation.** A response passes **only if BOTH**: (a) **correct** — matches gold with no misleading omission, and (b) **valid citation** — points to the specific source doc/section that actually contains the claim (wrong doc or unsupported = invalid). Score = (both-halves pass) / 100; the bar is ≥90%. Free-form answers use rubric scoring with reviewers calibrated on a subsample; LLM-as-judge is permitted **only** if validated against humans on a subsample, and humans arbitrate near the bar or on any suspected fabrication.

**Zero-fabrication control (separate red-team suite).** Adversarial / unanswerable questions, questions whose answers are absent from the corpus, and false premises. Required behavior is the **refusal path defined in Architecture** — never an invented answer or a confident citation on an unsupported claim. Detection = checking that the cited passage supports the claim. **HARD FAIL:** any fabrication blocks promotion regardless of the aggregate (92% can still fail).

**Failure logging — four buckets** that direct the quarter's effort: retrieval miss → fix indexing/chunking; reasoning error → fix prompting; bad citation → fix citation formatting; fabrication → hard-fail.

**Rollout gates (definitions; operational rollback + spot-check rates in Governance).** Shadow: assistant answers offline against live traffic; HR spot-checks; nothing user-facing. Limited: promote **only** when the golden set is ≥90% **and** the red-team suite shows zero fabrications. Full: same bar, sustained — a **post-quarter** gate.

## Governance, Security & Human-in-the-Loop

**Two invariants:** zero fabricated claims; no leakage of salary bands or individual HR records.

**Permission-aware retrieval (single source of truth).** Retrieval filters by the asker's identity/groups **before ranking**, using the access-scope metadata attached at chunk time. The user never sees a chunk from a doc they couldn't open in SharePoint. It **fails closed**: on any access-scope miss (unresolved identity, stale ACL cache, unconfirmable permission) the doc is dropped; if no permitted cited source remains, the assistant declines via the refusal path. This constrains exposure structurally rather than relying on the model to behave.

**Sensitive-content handling at INGESTION (not just at query time).** A redaction/exclusion policy runs during ingestion: docs/threads tagged salary/HR are either routed to a segregated, entitlement-gated index or excluded outright; free-text HR identifiers are redacted before chunking/embedding; Slack is ingested conservatively and reviewed first; **default is exclude-when-uncertain.**

**Spot-check HITL (single source of truth for sampling rate).** Launch condition, all rates **adjustable estimates**: begin at **~10%** of outputs, stratified to over-sample high-risk topics (HR/comp/leave). Reviewers verify the answer is correct, grounded and cited (the zero-fab check), that citations resolve to permitted docs, and that nothing leaks. As correct-with-citation stabilizes ≥90% over a sustained window, taper toward **~3–5%**, keeping high-risk strata elevated; any dip below the bar ratchets the rate back up.

**Audit logging / lineage.** Log the query, user identity/scope, retrieved docs plus the ACL decision, the answer, citations (doc IDs + versions), and the reviewer verdict.

**NIST RMF mapping.** Govern: named owner = the builder; zero-fab + no-leak policy; ingestion redaction policy. Map: inventory the corpus; classify by sensitivity; map ACLs → retrieval scopes. Measure: track correct-with-citation vs. 90%; count fabrications and leaks (target zero) via spot-check. Manage: fail-closed retrieval; sampled review; audit log; rollback.

**Rollback trigger + incident path (single source of truth).** A **pre-committed** trigger, set before any launch: **any confirmed fabrication in production OR any leaked salary/HR record OR spot-check accuracy falling below 90%** auto-pauses the assistant and reverts it to "no answer / contact HR / link to source." Incident path: flag → reproduce from the audit log → contain (pull the offending doc or scope) → root-cause (retrieval miss vs. ingestion gap vs. generation) → patch and re-test against the golden set + red-team suite before re-enabling.

## Delivery Plan — one builder, one quarter

All durations are estimates for one builder (~12–13 weeks); the spine is the acceptance bar.

- **W1 — Business Understanding + eval scaffold (front-loaded).** Lock scope; build the eval harness FIRST (100-Q gold set + automated scorer for correct-with-citation + fabrication flag). Also run Data Pipeline Step 0 (hand-inspect 20–30 files). *Exit:* harness scores a stub answerer ~0%; documented corpus-quality read.
- **W2–3 — Data Understanding + Preparation (top risk, readiness 3/5).** Inventory SharePoint, resolve the permission model, apply the ingestion exclusion policy for salary/HR, build the ingest → parse → chunk pipeline. *Exit:* a clean, de-sensitized, chunked corpus with source + access-scope metadata, and a documented list of excluded/problem docs. **Contingency lives here:** Slack FAQ optional; defer unparseable types.
- **W4–5 — Modeling: thin end-to-end slice.** Simplest RAG (embed → retrieve → generate with mandatory citations + the refusal path). *Exit:* the system answers all 100 questions and posts a first real baseline score.
- **W6–8 — Evaluation-driven iteration.** Loop the four failure buckets; drive fabrications to zero; tune latency. *Exit (W8):* ≥90% correct-with-citation AND zero fabrications at acceptable latency. **If not met, cut scope — do not extend.**
- **W9–10 — Deployment: shadow mode.** Ship behind spot-check; rollback trigger armed. *Exit:* shadow running on real queries with spot-check logging.
- **W11–12 — Limited rollout + hardening.** Small pilot group; fix gaps, refine abstention, confirm no leakage. *Exit:* pilot metrics hold ≥90% / zero-fab over a sustained sample.
- **W13 — Buffer / pilot close.** Slack reserved primarily for data-prep and eval slippage; if unused, begin the full-rollout case.

**Pilot "done":** bar met and sustained through the shadow → limited window with spot-check, no leakage observed, rollback path tested. **Out of scope:** automatic SharePoint change-sync; conversational memory / multi-turn; write-actions / workflow; org-wide (full) rollout; Slack-FAQ ingestion if prep runs long.

## Integration Notes — reconciled tensions

1. **Spot-check sampling rate.** Evaluation named "HR spot-checks" without a number; Governance specified ~10% → 3–5%. Resolution: adopt Governance's numbers as the single source (all labeled estimates), because they tie directly to the rollback trigger.
2. **Shadow → limited → full vs. one quarter.** Resolution: within the quarter, only shadow and limited are in scope; "full" is a post-quarter gate carrying the identical sustained ≥90% / zero-fab bar. A sustained full-rollout bar cannot responsibly fit 13 weeks for one builder.
3. **Data-prep risk vs. week plan.** Resolution: pull Step 0 hand-inspection into W1 and designate data-prep the first claimant on the W13 buffer. If Step 0 shows prep exceeds two weeks, the pre-agreed lever is deferring Slack-FAQ and unparseable docs rather than extending the quarter.
4. **Owner-of-risk in a one-builder project.** The builder owns delivery; **HR reviewers own** golden-set authoring, ratings, and spot-check verdicts; **SharePoint ACL fidelity** is an external-system dependency.

## Master Milestone Table

| Phase | Weeks (est.) | Goal | Exit criterion | Owner-of-risk |
|---|---|---|---|---|
| BU + eval scaffold (eval-first) | W1 | Lock scope; build 100-Q harness + scorer; run data Step 0 | Harness scores stub ~0%; corpus-quality read; golden set drafted | Builder (harness); **HR** (golden-set authoring) |
| Data Understanding + Preparation **(top risk)** | W2–3 | Inventory SharePoint, resolve permissions, exclude salary/HR, build ingest→parse→chunk | Clean de-sensitized chunked corpus w/ source + access-scope metadata; excluded-docs list | Builder; **SharePoint ACL/OCR fidelity** (external) |
| Modeling — thin slice | W4–5 | Simplest RAG w/ citations + refusal path | All 100 Q answered; baseline posted | Builder |
| Evaluation-driven iteration | W6–8 | Drive fabrications to zero; tune latency | **Gate:** ≥90% correct-with-citation AND zero fab at acceptable latency (else cut scope) | Builder |
| Deployment — shadow | W9–10 | Offline vs live traffic behind spot-check; arm rollback | Shadow live; ~10% spot-check logging; rollback set | Builder; **HR** (verdicts) |
| Limited rollout + hardening | W11–12 | Small pilot; refine abstention; confirm no leakage | **Gate:** pilot ≥90% / zero-fab / no leakage sustained; taper spot-check ~3–5% | Builder; **HR** (spot-check) |
| Buffer / pilot close | W13 | Absorb slippage (first claim); else full-rollout case | Bar sustained; rollback tested; full-rollout gate defined (post-quarter) | Builder |

*All week ranges are estimates for one builder over ~12–13 weeks. The invariants are hard gates at W8 and W11–12; missing them cuts scope rather than extending the timeline.*

---

# Part 2 — Critic's Audit (independent verifier)

*The critic wrote none of the plan and owed it no deference. Verbatim output.*

### Fabrication & unlabeled-estimate check
No must-remove items; no unlabeled hard fabrications. Week labels W1–W13 are globally (not individually) labeled estimates — OK, minor. "retrieval tens of ms" rides on one shared "estimates" label — acceptable but borderline. No fabricated benchmarks, adoption stats, ROI, or vendor names; model language is consistently vendor-neutral. **Clean on this axis.**

### Consistency with the case
No-leak rule, one-builder/one-quarter, spot-check-not-every-output, periodic freshness, and the citation requirement are all honored. **Minor tension — Slack FAQ:** the verified corpus *includes* "some Slack FAQ threads," but the plan repeatedly makes Slack the first thing descoped. Defensible, but it silently narrows the verified corpus and should be an explicit acceptance-affecting decision, not a quiet contingency.

### Gaps (load-bearing omissions)
1. **No cost/token budget** — tactics named (cap tokens, cache) but no per-query or monthly estimate and no ceiling that triggers scope cuts.
2. **User-identity plumbing assumed, not specified** — fail-closed retrieval filters "by identity/groups," but how the app authenticates the asker and maps them to SharePoint/Entra ACL groups (SSO) is never described. Load-bearing for the entire no-leak invariant and the most likely hidden schedule risk.
3. **ACL-change ownership hand-waved** — who remediates stale/broken ACLs when fail-closed starts dropping legitimately-answerable docs (a false-refusal source)? Unassigned.
4. **HR labeling/effort capacity unbudgeted** — the plan loads HR with 100-Q authoring + gold answers + ongoing rating + ~10% spot-check, but never estimates their hours or confirms availability. The spine depends on a team that isn't the builder and has no allocation.
5. **Corpus size never quantified** — "medium volume" carried verbatim; no target doc/chunk count. Step 0 should produce this figure as an exit criterion.
6. **No infra failure/timeout handling** — the two gates handle *grounding* failures; LLM API timeouts, connector outages, partial-index states aren't addressed. Does a timeout also fail-closed? Undefined.
7. **No numeric latency target** — "interactive"/"acceptable latency" is a hard constraint but has no p95 SLA, so the W8 gate is unfalsifiable on that dimension.

### Acceptance-bar spine check
**Genuinely the spine, not decorative.** Harness built W1 before retrieval code; W6–8 is an explicit gate; rollout promotion is gated on the bar; rollback fires on `<90%` or any fabrication/leak; zero-fab is a hard-fail overriding aggregate. Strong.

### Overclaim check
"Zero-fabrication **enforced** structurally" and leakage "**prevented**" read as guarantees. The two gates *reduce* fabrication; the Gate-2 validator is itself fallible, and the plan's own red-team/hard-fail logic concedes fabrication can slip through. Soften "enforced/prevented" to "structurally constrained / risk-reduced," consistent with the decision-support (not guarantee) guardrail. Mild but real.

### Verdict
**SHIP WITH FIXES.** Well-structured, honors the guardrails, makes the acceptance bar its spine; defects are omissions + two word-choice overclaims, not contradictions.

**Top 3 fixes, in priority order:**
1. Specify the user-identity → SharePoint-ACL integration (auth mechanism + owner for stale-ACL remediation). The no-leak invariant and false-refusal risk hinge on it.
2. Budget HR's labeling/spot-check effort and confirm allocation; add a corpus-size number as a Step 0 exit criterion.
3. Soften "enforced/prevented" to risk-reduction language; add infra failure/timeout handling + a numeric latency target so the W8 gate is testable.

---

# Part 3 — What this prototype tells us

- **It works, and the grounding is why.** Because the agents expanded a *verified* case (real fields, scores, engine-chosen architecture) rather than inventing from a raw idea, the output is concrete and case-specific, not boilerplate. This is the core argument for putting the swarm downstream of the studio rather than in place of it.
- **The critic earns its seat.** It caught the single most important omission (identity→ACL plumbing), an unbudgeted human dependency (HR effort), and a genuine honesty violation (the "enforced/prevented" overclaim against the studio's decision-support posture). A single-pass generator would likely have shipped all three. The verifier is what makes a multi-agent plan *more* trustworthy instead of just longer.
- **Bounded roster beats an open swarm.** Fixed lanes + one integrator + one critic gave clean, non-overlapping coverage and a reconciled result. No agent needed to "decide" who does what — which is where open-ended swarms burn tokens and drift.
- **Recommended production shape:** wire this as the engine behind a "Build Kickoff" export — trigger only on BUILD/REFINE verdicts, feed the agents the engine's own `recArchitecture` / `recDataAccess` / `recTesting` output as grounding, always run the critic, and present the plan *with* the critic's audit attached (as here) so the practitioner sees the caveats, never a false guarantee.
