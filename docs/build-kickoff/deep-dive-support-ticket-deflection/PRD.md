# PRD: Support Ticket Deflection & Reply Drafting

**Product Owner:** Use Case Studio — Product Management
**Status:** Draft for review
**Date:** 2026-08-13
**Companion documents:** Technical build plan and independent critic audit — `support-ticket-deflection-reply-drafting.md` (referenced throughout as "the build plan"). A dedicated architecture/technical design doc and a dedicated security/privacy review are follow-on deliverables to this PRD (see [Risks & Open Questions](#risks--open-questions)).

---

## 1. Problem Statement

Tier-1 support agents currently answer roughly 40 recurring question types by hand, at a volume of approximately 1,100 tickets per week with a median handle time of 9 minutes per ticket. This repeat-question workload occupies the equivalent of two agents effectively full-time. Agents are supposed to draw on a shared macro library for these recurring answers, but that library has drifted out of date: it is no longer trusted, so agents increasingly write from scratch or copy from whatever version they personally trust, producing inconsistent replies to customers asking the same questions.

The cost of not solving this is threefold: agent time spent re-composing answers that should be routine, customer-facing inconsistency that erodes trust in support quality, and a macro library that keeps drifting further because there is no mechanism forcing it to stay current. Left alone, this problem does not self-correct — it compounds as agents lose confidence in the shared resource and route around it.

## 2. Target Users / Personas

| Persona | Role in this feature | Primary need |
|---|---|---|
| **Tier-1 support agent** (primary) | Uses the drafted reply as a starting point inside the agent console; edits and sends, or discards | A fast, accurate, well-cited draft that saves composition time without asking the agent to trust it blindly |
| **Support lead** (primary stakeholder) | Owns the edit rubric, the acceptance-bar judgment, question-type scope decisions, and the go/expand/stop call | Confidence that the measurement is honest and that agents aren't being set up to send bad answers |
| **Compliance / privacy owner** (primary stakeholder) | Signs off on redaction evidence, retention design, and the data-exposure gating question before shadow mode ends | Written evidence that PII handling meets the bar, not a promise that it does |
| **End customer** (secondary, indirect) | Receives the resulting reply; never interacts with the assistant directly | A reply that is at least as accurate and consistent as today's, with no degradation in satisfaction |

## 3. Goals

1. Reduce the time Tier-1 agents spend composing replies to the ~40 recurring question types by giving them an editable, cited starting draft instead of a blank editor or a distrusted macro.
2. Restore agents' trust in the underlying knowledge base by grounding drafts in a curated, staleness-filtered corpus (help centre + triaged macros + redacted historical tickets) rather than the drifted macro library as-is.
3. Achieve the stated acceptance bar: **≥80% of drafts sent with only minor edits**, measured on 300 sampled tickets over a four-week live window, **with CSAT not dropping versus the pre-pilot baseline**.
4. Establish oversight and auditability as launch conditions, not later hardening: no draft is ever auto-sent, and every sent reply is traceable to the draft, sources, and reviewer action that produced it.
5. Create a durable feedback loop where retrieval gaps and stale content are surfaced back to the people who own the help centre and macros, so the underlying content-drift problem gets fixed, not just papered over.

### Non-Goals (v1)

- **Taking actions on customer accounts** (refunds, order changes, account edits) — this is a drafting/composition feature only; any action-taking capability is a separate initiative with its own risk profile.
- **Autonomous deflection directly to customers without an agent in the loop** — oversight is a stated, non-negotiable constraint; there is no code path from generation to outbound send, and this PRD does not scope one.
- **Handling all ~40 question types at launch** — v1 launches on a prioritised subset (highest-volume, lowest-ambiguity types); expanding coverage is the reward for holding the acceptance bar, not a v1 requirement.
- **Multi-turn conversation handling beyond the current ticket** — the assistant drafts a reply to the ticket in front of the agent; it does not manage ongoing conversation state across multiple exchanges.
- **Redesigning the macro library's long-term governance** — v1 includes a one-time triage of the existing library (current / needs-rewrite / retired) as an input to indexing; it does not stand up a new ongoing macro-authoring workflow beyond feeding the content-gap backlog described in Section 6.

## 4. User Stories

### Tier-1 agent (primary)

- As a Tier-1 agent, I want to open a ticket and see a pre-populated draft reply with cited help-centre sources, so that I don't have to compose a routine answer from scratch or hunt through a macro library I don't trust.
  - **Acceptance criteria:** Given a ticket matching an in-scope question type, when the agent opens or is assigned the ticket, then a draft appears in the reply editor with clickable citations to the specific source articles used, within the interactive latency expectation set for the pilot (see Section 7).
- As a Tier-1 agent, I want an explicit "no confident draft" state when the system isn't sure, so that I'm not tempted to trust a low-quality guess.
  - **Acceptance criteria:** Given a ticket where retrieval returns no sufficiently relevant content or citations fail to resolve, when the draft would be generated, then the console shows a clear "no draft available" state instead of a plausible-looking but ungrounded answer.
- As a Tier-1 agent, I want to edit or discard the draft freely, so that I remain accountable for what I actually send.
  - **Acceptance criteria:** Given any draft, when the agent edits, sends as-is, or discards it, then the console records which action was taken; there is no code path that sends a reply without the agent's explicit send action.
- As a Tier-1 agent, I want out-of-scope tickets to behave exactly as today, so that the tool doesn't create confusion about which tickets it covers.
  - **Acceptance criteria:** Given a ticket whose question type is not in the launched subset, when the agent opens it, then no draft is shown and the existing manual workflow is unchanged.

### Support lead

- As a support lead, I want a written, agreed rubric for "minor edit" before any drafts are shown to agents, so that the acceptance bar is measurable and not subjective.
  - **Acceptance criteria:** A rubric distinguishing sent-as-is / minor edit / major rewrite / discarded is signed off before shadow mode begins, and reviewer agreement on that rubric is measured, not assumed.
- As a support lead, I want a dashboard of minor-edit rate, CSAT versus baseline, and reviewer agreement, so that I can make the go/expand/stop decision on evidence.
  - **Acceptance criteria:** A live dashboard tracks the acceptance-bar metrics plus guardrail metrics (handle time, refusal rate, citation-resolution rate, escalation rate) throughout limited release and the four-week measurement window.
- As a support lead, I want a pre-agreed rollback trigger and a documented rollback procedure, so that a bad pattern in production gets stopped quickly and predictably rather than escalated ad hoc.
  - **Acceptance criteria:** Before limited release, the specific metric/threshold that pauses the assistant, who can pull the kill switch, what happens to agents mid-shift (fallback workflow), and the re-entry criteria are all documented and agreed with compliance. (This is currently an open gap — see Section 9.)

### Compliance / privacy owner

- As a compliance owner, I want measured evidence of redaction performance before any ticket-derived content reaches a model, so that I can make an informed sign-off rather than accept a design promise.
  - **Acceptance criteria:** A manually annotated hold-out sample of tickets is used to measure per-class redaction miss rates (names, order detail, card-last-four); results are reported honestly, including residual misses, before shadow mode ends.
- As a compliance owner, I want a written answer on whether ticket text (even redacted) may be sent to a third-party inference provider, so that the build doesn't proceed on an unresolved data-handling assumption.
  - **Acceptance criteria:** This question is answered in writing during Phase 1 (Frame, access and first contact), before corpus curation or model work begins.

### End customer (indirect)

- As a customer submitting a routine question, I want the reply I receive to be at least as accurate and consistent as what I'd get today, so that this initiative doesn't degrade my support experience while agents pilot it.
  - **Acceptance criteria:** CSAT on drafted-ticket types does not drop versus the pre-pilot baseline during limited release and the four-week measurement window.

## 5. Functional Requirements — Agent Console Experience

**P0 (must-have for launch):**

1. On ticket open (or assignment, where the platform allows pre-fetch), the console displays a drafted reply pre-populated in the existing reply editor — not a separate tab or external tool.
2. Every draft displays its cited source article(s) adjacent to the draft text, with citations clickable so the agent can verify facts quickly.
3. Drafts are visually and functionally labeled as drafts requiring agent action — never presented as if already sent or auto-authoritative.
4. An explicit "no confident draft available" state exists and is shown whenever retrieval or citation-resolution checks fail, in place of a low-confidence guess.
5. The agent can send, edit-then-send, or discard the draft. There is no system path that sends a reply to the customer without an explicit agent send action.
6. Out-of-scope question types show no draft; the agent's workflow is unchanged from today.
7. The console captures, for every ticket in scope, the matched pair of (a) the draft text as rendered and (b) the final text actually sent — this pair is the instrument the acceptance bar is measured with, and without both it cannot be measured.
8. The console captures the reviewer's rubric action (sent as-is / minor edit / major rewrite / discarded / escalated) as first-class telemetry on every ticket where a draft was shown.
9. The console captures whether a draft was shown at all, per ticket, to distinguish "no draft" from "draft discarded."
10. Every draft is logged with the prompt/template version, retrieved source identifiers, and model/config version used to produce it, to support later audit and dispute resolution (see Section 7 on what this logging can and cannot guarantee).

**P1 (should-have, strengthens the pilot but not blocking):**

11. A friction-free "discard" action, distinct from editing, so agents aren't nudged toward keeping content they don't trust just because it's already in the editor.
12. Visible indication of which question type the draft matches, so agents can sanity-check relevance before reading closely.
13. A lightweight way for an agent to flag a draft as wrong/misleading beyond simply discarding it, feeding the failure taxonomy described in the build plan.

**P2 (explicitly deferred, noted so later design doesn't foreclose them):**

14. Agent-side controls to adjust draft tone or length before generation.
15. Surfacing retrieval-miss / content-gap signals directly to agents (today these route to a backend content backlog only, per the build plan's data pipeline design).

## 6. Non-Functional Requirements

These requirements state the product-level expectation; several are explicitly flagged below as needing dedicated technical design rather than being resolved by this PRD.

| Requirement | Product-level expectation | Needs dedicated technical design? |
|---|---|---|
| **Latency** | Draft appears within an interactive expectation — agents should not feel blocked waiting on it; pre-fetch on ticket assignment should be used where the platform allows, with a clear pending state otherwise. | **Yes.** The build plan explicitly declines to commit a latency figure and instead calls for measuring actual end-to-end time in shadow mode and setting an internal target from observed data. This PRD does not invent one either. |
| **Availability / degraded mode** | Agents must have a defined, non-broken experience when retrieval or the model provider is slow or unavailable. | **Yes.** The critic audit identified this as an unhandled failure mode: there is currently no stated behaviour for provider/retrieval downtime beyond the "no confident draft" state for low-confidence cases, and no handling for the case where deterministic checks pass but the draft is confidently wrong. The architecture review must specify degradation behaviour and how "citation resolves but doesn't actually support the claim" is caught or mitigated. |
| **Auditability** | Every draft must be reconstructable after the fact: prompt version, retrieved source IDs, model/config version, redaction summary, reviewer action, and final sent text. | **Partially resolved at the design level, but scope of claim needs care.** This logging supports *reconstructing* what happened; it does not by itself *explain why* the model produced a given sentence. The security/privacy review and architecture doc should define what "audit" actually enables (dispute reconstruction) versus what it does not (root-cause explanation of model behaviour), and should not overstate this capability in agent- or customer-facing communication. |
| **Data protection / PII handling** | Redaction is designed to strip customer names, order history, and card-last-four before any ticket text reaches a model, applied both at corpus-ingestion time and at request time on the live ticket. | **Yes — dedicated security/privacy review required.** Redaction is a measured, imperfect control, not a guarantee. Residual miss rates per PII class must be measured against a manually annotated hold-out sample and reported to the compliance owner; this PRD does not claim "masked in all paths" or "no PII reaches the model" — see Section 9 for the specific open question this review must resolve. |
| **Oversight enforcement** | No code path exists from draft generation to an outbound customer-facing send. This is a design property, not a configurable setting. | Belongs to architecture doc to specify concretely (service boundaries, absence of an outbound-send credential/permission on the generation service), but the product requirement itself is fixed and non-negotiable per the case facts. |
| **Cost / unit economics** | Per-draft generation cost should be measured in shadow mode (including drafts generated on pre-fetch that an agent never uses) against the time savings the feature is meant to produce. | **Yes.** The critic audit flagged that the build plan currently has no cost ceiling, no budget alert, and no decision rule if per-draft cost exceeds the value of the time saved, despite this being funded from a bounded support-tooling budget line. The architecture/delivery plan must add a measured cost gate with a pre-agreed action if it's exceeded. |
| **Content freshness** | Stale or retired macro/help-centre content must be filtered out of what retrieval can return, on a defined refresh cadence. | Standard technical design (indexing/refresh cadence); not flagged as a gap by the critic audit. |

## 7. Success Metrics

These are the metrics given in the source case facts and the build plan's evaluation design. This PRD does not introduce new numeric targets beyond what was specified.

**The bar (primary, from acceptance criteria):**
- **≥80% of drafts sent with only minor edits**, measured on **300 sampled tickets over a four-week live window**, scored against a rubric agreed with the support lead before the drafts are shown to agents in the review queue.
- **CSAT must not drop versus the pre-pilot baseline**, measured on matched ticket types. (Note: establishing that pre-pilot baseline is currently only an *assumption* in the build plan — see Section 9. It needs an explicit owner and deliverable date before it can be trusted as a comparison point.)

**Important distinction this PRD preserves from the critic audit:** offline rubric scoring against a golden set of historical tickets (used in Phase 3, before any agent sees a draft) is a **proxy** for the acceptance bar, not the bar itself. The acceptance bar, by definition, requires an agent's actual send action on live traffic. Any status reporting before Phase 6 should be labeled as proxy progress, not bar attainment.

**Guardrail / companion metrics** (do not replace the bar, but gate whether the pilot is healthy enough to keep running):
- Reviewer agreement across agents on the edit rubric — if agreement is low, the 80% figure is noise and the rubric needs fixing before it's trusted.
- Handle time on drafted versus non-drafted tickets.
- Refusal / no-draft rate.
- Citation-resolution rate.
- Escalation rate.
- Proximity to the rollback trigger (once defined — see Section 9).

## 8. Phased Rollout Plan

This section summarizes, at the PRD level, the phasing already defined in the build plan's milestone table. It states phase names, purpose, and exit gates — implementation detail (specific pipeline steps, index technology, etc.) is intentionally left to the architecture doc.

| Phase | Purpose | Exit gate (summary) |
|---|---|---|
| **1. Frame, access & first contact** | Lock the edit rubric, secure data access, hand-inspect real samples, resolve the compliance gating question on model exposure to redacted ticket text. | Rubric signed off by support lead; prioritised question-type subset agreed; compliance owner has answered the data-exposure question in writing. |
| **2. Corpus curation, redaction & index** | Build a grounding corpus that is actually trustworthy — macros triaged, help centre cleaned, tickets redacted and indexed with retrieval-filtering metadata. | Macro library triaged (current / needs-rewrite / retired); index live with staleness filters enforced; redaction miss rates measured and accepted by compliance. |
| **3. Thinnest scoreable loop + golden set** | Retrieval + prompt + deterministic checks producing cited drafts, scored offline before any agent sees them. | Golden set of labelled tickets (routine, edge, and must-refuse cases) running on every change; offline proxy scoring reported *as a proxy*, not as bar attainment; failure taxonomy populated. |
| **4. Console integration & shadow mode** | Draft-into-editor integration plus the matched draft/sent telemetry pair; system runs in shadow — drafts scored, not shown as binding to agents. | Telemetry reliably emits the draft/sent pair and reviewer action for every in-scope ticket; latency observed and an internal target set from real data; red-team findings triaged. |
| **5. Limited release behind mandatory review queue** | Volunteer agent cohort uses drafts for real, on the prioritised question types, with the rollback trigger armed. | Rollback trigger and procedure documented and agreed (see Section 9 — currently a gap); audit trail verified end to end; dashboard live with no trigger breached. |
| **6. Four-week acceptance measurement & go/stop decision** | Measure the actual bar on live traffic; decide, on evidence, whether to expand, iterate, or stop. | ≥80% minor-edit rate on 300 sampled live tickets over four weeks, CSAT not below baseline, reported with rubric and reviewer-agreement evidence; if missed, a documented iterate-or-stop decision is made with the support owner. |

**A scheduling flag this PRD carries forward rather than hides:** the build plan's own milestone durations sum to roughly 17 weeks, while the stated resourcing is one builder for a quarter (roughly 13 weeks) plus agent review time. This mismatch is unresolved in the source plan and should be reconciled explicitly with the support owner — either by compressing scope/phases or by formally accepting that the four-week live measurement lands outside the initial quarter. This PRD does not resolve it; it flags it as a delivery-planning decision that needs to be made before Phase 1 commitments are finalized.

## 9. Risks & Open Questions

Two dedicated follow-on reviews are required before this feature proceeds past shadow mode. This PRD does not attempt to resolve their subject matter — it names the specific questions each must answer, pulled directly from the build plan's independent critic audit ("load-bearing gaps").

### Requires a dedicated security/privacy review

1. **Rollback is currently a trigger, not a procedure.** The plan pre-commits *that* a metric/threshold will pause the assistant, but not *how*: Is there a named kill switch? Who has authority to pull it? What happens to drafts already in an agent's editor when it's pulled? Do agents fall back to the same drifted macro library the feature was meant to replace? What are the re-entry criteria to resume after a rollback? **This must be resolved before limited release (Phase 5), not discovered during an incident.**
2. **Redaction is a measured control, not a guarantee.** This PRD deliberately does not claim redaction "masks card-last-four in all paths" or that "public content carries no PII" as settled facts — both were flagged by the critic audit as overstated relative to what the design actually delivers. The security/privacy review must report the actual per-class miss rate from the annotated hold-out sample and make an explicit recommendation on whether any high-sensitivity ticket categories should be excluded from the assistant entirely.
3. **Third-party model inference on redacted ticket text** — is it permitted under current data-handling terms, and what training-on-data terms would apply? This is a gating question for Phase 1, not a launch-week discovery, and the compliance owner's written answer is a P0 dependency for the entire pipeline.
4. **Audit trail scope.** Confirm and communicate accurately that the logged prompt/chunk/version trail supports *reconstructing* what happened for a disputed reply — it does not, by itself, *explain* why the model generated a particular sentence. Avoid the stronger claim in any customer- or agent-facing documentation.

### Requires a dedicated architecture/technical design review

5. **Degraded-mode behaviour is unspecified.** What happens when retrieval or the inference provider is down or slow past the interactive latency expectation? The "no confident draft" state currently only covers low-confidence *results*, not provider unavailability. The architecture review must specify this explicitly.
6. **Post-check false negatives.** A citation can resolve to a real retrieved chunk while the chunk does not actually support the claim made in the draft — the current deterministic checks would pass this case. The architecture review must define a claim-support check, or, short of that, an explicit prompt/UI treatment that pushes the agent to verify facts rather than trust citation presence alone.
7. **No cost / unit-economics guardrail exists yet.** With pre-fetch on ticket assignment, drafts are generated even for tickets an agent never acts on. There is currently no cost ceiling, no budget alert, and no decision rule for what happens if measured per-draft cost exceeds the value of the 9-minute median time saved. This must be added as a measured gate in shadow mode (Phase 4) with a pre-agreed action if breached.
8. **Golden-set label validity.** The offline golden set is drawn from historical resolved tickets whose "correct" replies were produced against the same drifted macro library this feature is meant to fix. The architecture/evaluation design must state how gold labels avoid simply encoding that pre-existing drift.
9. **CSAT baseline and comparison validity.** A pre-pilot CSAT baseline is currently only assumed to exist or be establishable — no milestone or owner is assigned to actually producing it, yet Phase 5 arms a rollback trigger against it and Phase 6 measures against it. This needs an explicit owner and a Phase 1/2 deliverable date. Separately, the comparison method must account for the fact that the limited-release cohort is self-selected volunteers and that the four-week window may carry seasonal effects — neither is currently addressed.
10. **Console integration feasibility is unvalidated.** Whether the ticketing platform actually supports pre-populating the reply editor and reliably emitting both the rendered draft and the final sent text has not been confirmed with a stub. Given that this telemetry pair is the entire measurement instrument for the acceptance bar, this should be validated earlier than currently scheduled (the build plan schedules it in Phase 4, after prompt/model work in Phase 3, despite the same document elsewhere calling for validating it "before model work begins" — this inconsistency should be resolved in the architecture doc).

### Other open questions (non-blocking, but should be tracked)

- Who is the named support content owner responsible for macro triage, and is their time actually calendared for Phase 2 — this is a stated dependency for everything downstream.
- What specific action does an agent take when a ticket falls into an out-of-scope question type mid-triage (i.e., looks in-scope at open but turns out ambiguous) — this affects console UX design, not just the model.
- How will the ~17-week phase total be reconciled against the "one builder for a quarter" resourcing constraint (see Section 8) — a support-owner-level scheduling decision, not a technical one.

## 10. Out of Scope for v1

- Any capability that takes action on a customer's account (refunds, order edits, account changes) on the agent's behalf.
- Sending a reply to a customer without an agent's explicit review and send action, under any configuration or toggle.
- Coverage of all ~40 recurring question types — v1 launches on a prioritised, lower-ambiguity subset only.
- Multi-turn conversation memory beyond the ticket currently open.
- A new ongoing macro-authoring workflow — v1 performs a one-time triage of the existing library as an indexing input, not a redesign of how macros get maintained going forward.
- Any promise or feature suggesting drafts are guaranteed accurate, PII-free, or auto-approved — none of these properties are established by the current design and none are claimed by this PRD.
- Exposing retrieval-miss / content-gap signals directly in the agent-facing UI (routes to a backend content backlog only in v1).
- Cost, latency, and throughput targets as committed numbers — these are measured in shadow mode per Section 6 and set from observed data, not asserted here.
