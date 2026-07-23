# Build Kickoff — Swarm Prototype, Case 2 (Classify / REFINE)

*Second run of the same 7-agent pipeline (5 specialists → integrator → critic) on a deliberately different studio output, to test whether the roster generalizes beyond the first case.*

## Why this case

Case 1 was the policy assistant: `lookup` task, **RAG** architecture, **BUILD** verdict, a fixed one-builder/one-quarter constraint. This case is chosen to differ on every one of those axes:

| Axis | Case 1 — Policy assistant | Case 2 — Invoice triage |
|---|---|---|
| Task shape | `lookup` | `classify` |
| Studio architecture | RAG (retrieval + citations) | Classifier + confidence gate |
| Verdict | **BUILD** (77) | **REFINE** (66) — conditional |
| Data sensitivity | internal | **PII + vendor bank details + retention** |
| Dataset | corpus to index | **natural labeled dataset (quality unverified)** |
| Latency | interactive | batch |
| Constraint | one builder / one quarter | **budget unscoped** |
| Key failure mode | fabricated citation | **minority-category misrouting; wrong payment** |

If the same fixed roster produces a materially different — and correct — plan here, that's the evidence that the pipeline belongs downstream of the studio as a general feature, not a one-off for RAG.

**Run stats (this run):** 7 agents, ~277k subagent tokens, specialists in parallel.

---

# Part 1 — Integrated Implementation Plan (Invoice & Document Triage)

## Executive Summary

This case received a **REFINE verdict (66/100, "Quick win," NOT build-ready)** — a conditionally promising idea that must clear a cheap **Phase-0 gate before any build is funded**, not a green light. The system, in one line, is an **8-label document classifier with a confidence gate that auto-routes confident predictions and sends every sub-threshold prediction to a human review queue.** Two requirements form the spine: **(1) ≥95% routing accuracy on a frozen 500-doc held-out set, in aggregate and per-category, and (2) a one-directional fail-safe — every below-threshold prediction, and any system error, defers to a human rather than silently auto-routing.** The data carries **PII and vendor bank details under retention rules**, raising the risk profile above an internal tool and contributing directly to the REFINE verdict. **Budget is unscoped and gates the build:** scoping cost against the only value anchor (roughly ~1 FTE of effort saved — an estimate, not validated ROI) is itself a Phase-0 exit. No benchmarks, vendors, or ROI beyond the case's own ≥95% bar are invented; every duration/volume is a labeled estimate. If Phase 0 shows the baseline has no headroom, labels are too noisy to clear 95%, or the value can't cover the build, the correct outcome is **no-go**.

## Architecture (REFINE / conditional design)

**Online components:** an **ingestion poller** on the shared inbox / AP drive (real-time arrival but batch-tolerant → **queue-and-schedule**, not streaming); **document understanding/extraction** normalizing mixed formats with **OCR for scans** (extraction-confidence signal; unreadable → human); a **classifier** doing direct prompting → structured `{category, confidence}` over a **fixed CLOSED 8-label schema** (no-fit → low confidence, never a fabricated label); the **confidence gate/router** (load-bearing); the **human review queue**; and a **feedback loop** (corrections → labeled data → *later* option of a fine-tuned small model only if unit economics justify it).

**Why the gate makes ≥95% targetable (stated once here):** the bar is measured on the **routing system**, not the raw model — only confident predictions auto-route; uncertain ones defer to a human. Higher threshold = safer routing, larger queue. Calibrated on validation, evaluated on the auto-routed subset (mechanics in Evaluation; fail-safe direction in Governance).

**Offline flow:** sorted docs → **verify labels first** → clean/dedupe → split train | validation | frozen 500-doc held-out → calibrate threshold on validation → measure on held-out (≥95%).
**Online flow:** incoming → extract → classify → `confidence ≥ threshold?` → **yes:** auto-route / **no:** human queue → log + feedback.

## Data Pipeline

**Step 0 — verify the labeled dataset first (the biggest REFINE→BUILD de-risker).** The "already-sorted" folders are **noisy labels**. Stratified sample across all 8 categories (oversample thin ones); AP owner re-adjudicates; measure mislabels, ambiguous/multi-category cases, and 12-month category drift; **report label-accuracy % + CI.** Label accuracy is the **ceiling** on model accuracy — noisy folders must be cleaned before ≥95% is credible.

**8-category schema:** exact labels + 1–2 sentence definitions with positive/negative examples; decide the multi-category policy (single-best vs multi-label) and none-of-the-above handling (a 9th "reject/other" → human queue is safer). **Ingestion:** read-only least-privilege service account (read, not move/delete); structured fields + OCR with extraction-confidence; batch windows. **Splits:** frozen 500-doc held-out, stratified across the 8, drawn from a recent window to avoid drift contamination. **PII/bank:** redact/segregate at ingestion where the classifier doesn't need it; access-control training data; align retention with existing AP policy.

## Evaluation

**Baseline first (part of the refine gate):** the current human misroute rate is unquantified. Measure two ways — misroute logs (a **floor**; only caught errors) and a random audit sample re-labeled by **two independent AP staff** (true human accuracy + CI + inter-annotator agreement; if humans disagree, the gold labels — and the bar — are unreliable).

**Scoring (authoritative home for the spine):** per-doc exact match vs the 8-label gold on the frozen 500-doc held-out (locked, never tuned on); report the **8×8 confusion matrix and per-category precision/recall.** Aggregate ≥95% can hide a failing minority category — **a category passes only if its own recall clears the bar.**

**Threshold under test:** sweep T; plot auto-route accuracy vs queue volume; **≥95% is evaluated on the auto-routed subset only** (sub-threshold correctly deferred). Pick the lowest T clearing ≥95% aggregate AND per-category while the queue stays acceptable to AP ops (an **ops decision, not a fixed number**; ≤25% is illustrative). Per-category thresholds if needed. **Calibration:** reliability diagram / ECE — thresholding is safe only if 0.9 ≈ 90% correct. **Red-team:** near-duplicate/ambiguous/edge docs — pass = lands in the queue, not confidently misrouted (a confident wrong route on bank-PII is the worst case). **Rollout:** shadow (parallel, no live impact) → limited (low-risk subset) → full; **rollback pre-committed before shadow.**

## Delivery — from REFINE to a scoped build

**Phase 0 — refine gate (~2–4 wks, estimate):** (1) quantify current misroute rate (logs + ~300 sample); (2) verify label quality; (3) lock the 8-category definitions; (4) scope budget vs the ~1 FTE value anchor. **Exit = explicit go/no-go to FUND the build** (no-go if baseline has no headroom, labels too noisy for 95%, or value can't cover cost).

**Build phases (conditional):** data prep (verified corpus, PII secured, freeze held-out) → thin classifier (scored on held-out) → threshold calibration → per-category hardening (each clears its own bar) → human-queue integration (overturn logging) → shadow (≥95% sustained, rollback armed) → limited (**pilot done** = ≥95% sustained live + queue functioning + rollback armed) → full (all 8, queue retained). **Named risks:** budget unscoped (gating); label quality caps accuracy; minority misrouting; financial consequence of a bad auto-route. Milestones tracked by **phase, not week numbers.**

## Governance, Security & HITL

PII + bank details + retention make this heavier than an internal tool (risk 3/5 — a reason for REFINE). Encrypt at rest/in transit; least-privilege via existing entitlements; redact/mask bank numbers at ingestion (tokenize only if a signal is genuinely needed and confirmed); **retention alignment is mandatory for source docs, stored training data, AND logs** — no accumulation beyond the invoice retention window; the **feedback store is PII/bank-bearing and gets the same controls, never a looser "training" tier.**

**HITL fail-safe (one-directional):** uncertainty always defers to a human; if the model, scorer, or gate errors or is unavailable, the **safe state is queue, not route.** **Financial consequence:** a wrong auto-route means a late/wrong payment, so the threshold is a **risk control**, and every routed financial doc needs an audit trail + a correction path that can reverse before payment executes. **Audit log:** input ref, category, confidence, routed-vs-queued, override + reviewer + timestamp.

**NIST RMF:** Govern (named owner for gate/thresholds; retention; least-privilege; approval to change threshold/logic) · Map (8 categories + financial-consequence severity; minority/bias risk; PII/bank flows) · Measure (per-category not just aggregate; calibration; minority recall separately; held-out before promotion) · Manage (queue; correction path; drift/incident monitoring; rollback). **Rollback trigger:** per-category accuracy below bar (even if aggregate passes), a confirmed financial misroute, or confidence miscalibration → freeze auto-route, all to queue, notify owner, incident with lineage, remediate + re-validate on held-out before re-enabling.

## Integration Notes — reconciled tensions

(a) **Queue-volume target is an ops decision, not a fixed number** (≤25% was illustrative only). (b) **Phase-0 durations are estimates; budget scoping is a Phase-0 exit, not an input** — milestones by phase, not calendar. (c) **The eval baseline and the delivery Phase-0 baseline are one activity, run once** (eval's two-method rigor at ~300-doc sample), co-scheduled with Step-0 label verification.

*(The integrator's full Master Phase Table with an Owner-of-risk column is retained in the working record.)*

---

# Part 2 — Critic's Audit (independent verifier)

*The critic wrote none of the plan. Verbatim highlights.*

**Fabrication & unlabeled-estimate check:** No vendor names, external benchmarks, or ROI stated as fact; the only hard requirement is the case's own 95%. One **must-label**: the hypothetical "~90% consistent" should read explicitly as an example, not a measured finding, so no reader cites it as the corpus's real label accuracy. Otherwise clean.

**Consistency with the case:** **None material found** — PII/bank/retention, batch latency, required oversight, unscoped budget, and the ≥95%/per-category/sub-threshold bar are all honored, and REFINE-not-BUILD is carried by the header, verdict, and gate.

**REFINE-integrity check:** **Passes.** Three independent kill conditions (label ceiling, no baseline headroom, value < cost) with concrete tests; the build half is explicitly gated ("Build (conditional)"). Presentation caveat: make the go/no-go a hard section boundary so the volume of build detail can't read as a green light.

**Gaps (load-bearing):**
1. **Human-queue economics at scale vs the ~1 FTE saving** — nobody costs the queue; a conservative threshold routing 20–25% to humans could erode or exceed the value anchor. Should be a **fourth no-go condition.**
2. **Per-category bar vs a single 500-doc held-out** — a rare class may have too few examples for a meaningful ≥95% (wide CI); an un-evaluable minority should block that category's promotion. The "~30–40 illustrative floor" is never reconciled with the fixed 500.
3. **Label-cleaning effort/cost if Step 0 fails** — no scoped remediation path (who re-labels, how many, inside or outside the Phase-0 budget).
4. **Drift/retraining cadence** — realtime arrival implies shift, but no re-validation trigger, cadence, or held-out-refresh owner.
5. **Non-ML upstream fix** — reducing misroutes at the source (vendor/portal metadata, structured submission, sender rules) is the cheapest path to the value and a legitimate Phase-0 alternative to funding a build.
6. **AP/payment write-path integration** — "auto-route" and "before payment executes" presuppose a downstream system; the write-path, idempotency, and reversal/hold mechanics are unspecified.
7. **Human-queue turnaround SLA** — deferred docs must still be paid on time; without an SLA the fail-safe trades misroutes for late payments.

**Acceptance-bar spine check:** Genuinely the organizing principle — it drives eval, threshold selection, rollout promotion, NIST "Measure," and rollback. Spine intact.

**Overclaim check:** One soft phrase — "confidence gate **makes** ≥95% achievable" states an outcome; prefer "is intended to make ≥95% targetable, measured on the auto-routed subset." No hard overclaim otherwise.

**Verdict: SHIP WITH FIXES.** Top 3: (1) add human-queue cost-at-scale vs ~1 FTE as an explicit Phase-0 no-go input, plus a queue turnaround SLA; (2) reconcile the per-category bar with the frozen 500 (define minimum evaluable samples per class; treat un-evaluable minorities as non-promotable); (3) scope the AP/payment write-path and the label-remediation path, re-label the hypothetical "~90%," and soften "makes ≥95% achievable."

---

# Part 3 — Does the roster generalize? (comparison to Case 1)

**Yes — decisively, and for a specific reason: the agents are anchored to the engine's per-case computed outputs, so changing the case changes the plan without changing the roster.** What moved between the two runs, with no change to the agent definitions:

- **Architecture agent** produced a **classifier + confidence gate** here vs a **RAG + citation** design in Case 1 — because `recArchitecture` keys off `taskShape` (`classify` vs `lookup`). It correctly dropped citations/retrieval entirely.
- **Delivery agent** led with a **Phase-0 go/no-go gate that can say NO** and used **phases instead of week numbers** (budget unscoped) — vs Case 1's committed 13-week schedule. It read the **REFINE** verdict as "conditional," not "build."
- **Evaluation agent** shifted from **golden-set + citation-correctness + zero-fabrication red-team** to **confusion matrix + per-category recall + confidence-threshold calibration + a required current-baseline measurement** — the right eval vocabulary for classification.
- **Governance agent** escalated from internal-sensitivity controls to **PII/bank-details/retention + financial-consequence (wrong payment)** controls, and reframed the confidence threshold as a *risk* control.
- **Integrator** preserved the REFINE framing end-to-end and caught a cross-agent overlap unique to this case (the eval baseline and the delivery Phase-0 baseline are the same measurement).
- **Critic** surfaced entirely different, case-appropriate gaps — **queue economics vs the FTE saving, per-category evaluability on 500 docs, a non-ML upstream alternative, the payment write-path** — none of which applied to the RAG case.

**Implication for the product.** The prototype supports a "Build Kickoff" feature whose behavior is **driven by the verdict and the task shape**, both of which the engine already computes:

- **Gate on verdict:** BUILD → an implementation plan; **REFINE → a "gate + conditional plan"** that opens with what must be resolved before funding and a go/no-go that can legitimately say no; PARK → decline to generate (or a "what would have to change" note).
- **Branch architecture on `taskShape`:** RAG / classifier / agent / workflow templates, each with its own eval vocabulary — exactly what the two runs demonstrated.
- **Always run the critic, and always attach its audit** so the practitioner sees the caveats (queue cost, un-evaluable minorities, overclaim wording) instead of a false green light.

Two runs, one roster, two correct and materially different plans. That is the case for building this as a feature rather than hand-running it.
