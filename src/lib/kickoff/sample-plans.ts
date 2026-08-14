/* DRAFT — prepared by Cowork, not yet wired into the app or reviewed by Claude Code.
   See docs/build-kickoff/KICKOFF-SAMPLE-PLANS-HANDOFF.md for the integration ticket.

   Condensed metadata for 7 Build Kickoff plans generated live against the existing
   EXAMPLES entries in src/lib/examples.ts (matched 1:1 by `exampleName`). Full plan
   markdown (as returned by the Kickoff pipeline, critic audit included) lives at
   docs/build-kickoff/sample-plans/<slug>.md.

   Intent: let someone trying an example case in the Studio see a real sample output
   from Build Kickoff before running (or paying for) their own case. */

export type KickoffSamplePlan = {
  exampleName: string; // must match a `name` in EXAMPLES (src/lib/examples.ts)
  slug: string; // filename under docs/build-kickoff/sample-plans/
  taskShape: "lookup" | "generate" | "classify" | "process";
  architecturePattern: string;
  summary: string;
  phases: number;
  durationEstimate: string;
  criticVerdict: "ship_clean" | "ship_with_fixes" | "do_not_ship";
  criticTopGaps: string[];
  criticTopFixes: string[];
};

export const KICKOFF_SAMPLE_PLANS: KickoffSamplePlan[] = [
  {
    exampleName: "Internal policy & knowledge assistant",
    slug: "internal-policy-knowledge-assistant",
    taskShape: "lookup",
    architecturePattern: "Retrieval-augmented generation (RAG)",
    summary:
      "A grounded RAG assistant answering employee HR/IT policy questions with citations. Effort concentrates on ingestion quality, chunking/metadata, retrieval precision and refusal behaviour. Data readiness scored lowest (3/5), so the plan front-loads a hands-on corpus audit and treats sensitive-content exclusion as an ingestion-time filter. Ships through shadow mode and sampled review, with a pre-committed rollback trigger.",
    phases: 6,
    durationEstimate: "~10–12 weeks (estimate)",
    criticVerdict: "ship_with_fixes",
    criticTopGaps: [
      "No no-go / kill path if Phase 2 can't reach the acceptance bar.",
      "“Zero fabricated policy claims” is treated as verifiable when the design only samples in production.",
      "Verification of sensitive-content exclusion is asserted, not specified.",
      "No rollback mechanics for the index itself.",
    ],
    criticTopFixes: [
      "Resolve the 8-week vs ~10–12-week schedule contradiction; add an explicit no-go branch.",
      "Strip or label unsupported quantitative/superlative claims as judgement, not fact.",
      "Specify the verification procedure and owner for sensitive-content exclusion.",
    ],
  },
  {
    exampleName: "Support ticket deflection & reply drafting",
    slug: "support-ticket-deflection-reply-drafting",
    taskShape: "generate",
    architecturePattern: "Direct prompting grounded with RAG over reference material",
    summary:
      "Retrieval over the help centre, curated resolved-ticket exemplars and surviving macros grounds a drafted reply composed with inline citations. Every draft lands in the agent's editor — never auto-sent. Redaction happens before any text reaches a model; macro-library clean-up is treated as an explicit curation task.",
    phases: 6,
    durationEstimate: "~17 weeks (estimate; longer than the stated one-quarter budget)",
    criticVerdict: "ship_with_fixes",
    criticTopGaps: [
      "Rollback is a trigger, not a procedure — no kill switch, owner, or re-entry criteria.",
      "No cost or unit-economics guardrail despite cost being a stated constraint.",
      "No stated behaviour for retrieval/inference outage or confidently-wrong drafts.",
      "Golden-set labels are drawn from tickets answered under the macro drift the project exists to fix.",
    ],
    criticTopFixes: [
      "Reconcile the ~17-week schedule against the one-builder-per-quarter budget.",
      "Separate the offline proxy metric from the live acceptance bar.",
      "Add a named kill switch, owner, and a measured per-draft cost gate in shadow mode.",
    ],
  },
  {
    exampleName: "Field service report summarization",
    slug: "field-service-report-summarization",
    taskShape: "generate",
    architecturePattern: "Direct prompting grounded with RAG over reference material",
    summary:
      "The parts catalogue and two years of note/work-order pairs ground the model, which composes the summary into fixed fields. Part numbers are constrained by deterministic lookup rather than left to generation. Oversight starts as sampled human review and tapers only as measured accuracy holds.",
    phases: 7,
    durationEstimate: "ongoing after ~15–18 weeks (estimate)",
    criticVerdict: "ship_with_fixes",
    criticTopGaps: [
      "The part-number gate checks catalogue existence, not that the part was actually used.",
      "No independent evaluation of the transcription layer everything downstream depends on.",
      "Audio/transcript retention policy is an unresolved discovery item with no owner.",
      "No abort/refine path if Phase 0 or Phase 3 fails.",
    ],
    criticTopFixes: [
      "Redefine the fabrication metric as parts-used precision/recall.",
      "Score shadow mode against admin-verified work orders, not next-morning transcription.",
      "Move rollback-trigger commitment and audio-retention confirmation into Phase 0.",
    ],
  },
  {
    exampleName: "Procurement contract clause review",
    slug: "procurement-contract-clause-review",
    taskShape: "classify",
    architecturePattern: "Direct prompting with structured output (fixed label set + confidence)",
    summary:
      "A batch annotation service that pre-marks each inbound contract and routes it to a mandatory counsel review queue. Every exit criterion ladders to the acceptance bar, measured per clause type rather than in aggregate. The system advises and never signs; counsel remains the decision-maker.",
    phases: 8,
    durationEstimate: "ongoing after ~21–28 weeks (estimate)",
    criticVerdict: "ship_with_fixes",
    criticTopGaps: [
      "Threshold tuning on the iteration set risks contaminating the held-back recall read.",
      "No precision/load floor — a classifier that flags everything passes every stated exit criterion.",
      "Segmentation/conversion loss is unmeasured as a first-class failure mode.",
      "No defined handling for a playbook change mid-pilot.",
    ],
    criticTopFixes: [
      "Add a quantified reviewer-load floor so recall can't be met by over-flagging.",
      "Fix held-back-set discipline: freeze thresholds before the held-back read.",
      "Consolidate the rollback trigger into one deadline with concrete numbers.",
    ],
  },
  {
    exampleName: "Insurance FNOL intake extraction",
    slug: "insurance-fnol-intake-extraction",
    taskShape: "process",
    architecturePattern: "Orchestrated multi-step workflow (deterministic pipeline with LLM steps where judgment is needed)",
    summary:
      "Deterministic ingest, normalisation and validation, with LLM extraction only where the source is unstructured. Policy numbers are validated against the policy master as a deterministic gate. Human review is a launch condition — oversight is required and the data is regulated.",
    phases: 6,
    durationEstimate: "ongoing after ~19–24 weeks (estimate)",
    criticVerdict: "ship_with_fixes",
    criticTopGaps: [
      "No defined path if the ≥97% accuracy bar is missed.",
      "OCR/transcription quality has no acceptance gate of its own.",
      "Duplicate-detection and failed-write retry paths are unhandled.",
      "Cross-claim leakage risk is tested for, but not architecturally constrained.",
    ],
    criticTopFixes: [
      "Reconcile Phase 6 auto-accept with the unconditional human-in-the-loop launch condition.",
      "Add an explicit failure branch for missing the ≥97% bar plus a per-channel OCR quality gate.",
      "Label invented specifics (team composition, cadence) as proposals, not facts.",
    ],
  },
  {
    exampleName: "Marketing localization QA",
    slug: "marketing-localization-qa",
    taskShape: "classify",
    architecturePattern: "Direct prompting with structured output (fixed label set + confidence)",
    summary:
      "A batch pipeline scores every localized string against the nine-locale brand glossary and source string, then emits a ranked, flagged diff queue per region. Humans keep the publish decision. The held-out 500 is frozen and access-controlled from day one to avoid label leakage.",
    phases: 8,
    durationEstimate: "ongoing after ~13–18 weeks / campaign cycles (estimate)",
    criticVerdict: "ship_with_fixes",
    criticTopGaps: [
      "No off-ramp if the frozen held-out gate fails.",
      "The false-flag rate has no defined denominator or review window.",
      "The ongoing manager-disposition label stream is treated as ground truth with no periodic re-check.",
      "No cost ceiling despite cost being a stated constraint.",
    ],
    criticTopFixes: [
      "Define the failure branch of the held-out gate.",
      "Make the false-flag metric operational — fix denominator, window, sample size.",
      "Add a recurring inter-rater/adjudication audit of the live manager label stream.",
    ],
  },
  {
    exampleName: "Grant proposal first-draft assembly",
    slug: "grant-proposal-first-draft-assembly",
    taskShape: "generate",
    architecturePattern: "Direct prompting grounded with RAG over reference material",
    summary:
      "A batch drafting job: the system retrieves approved passages and prior funded language, and composes a sectioned first draft where every claim and number carries an inline citation. Numbers are retrieved and quoted, never generated. No draft leaves the review queue without a named grant writer signing off.",
    phases: 7,
    durationEstimate: "the pilot quarter plus a 1-week decision phase (estimate)",
    criticVerdict: "ship_with_fixes",
    criticTopGaps: [
      "The numeric verifier's false-positive rate is never measured.",
      "No degraded-mode or failure path for the run itself.",
      "Sample-size honesty for the ≥70% bar isn't addressed.",
      "Conflicting-figure resolution has no named owner in the live flow.",
    ],
    criticTopFixes: [
      "State explicitly how the ≥20-proposal count is composed.",
      "Add a measured citation-support accuracy check.",
      "Reconcile the two different definitions of the provenance bar into one.",
    ],
  },
];
