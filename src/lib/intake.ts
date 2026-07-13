/* =============================================================
   Discovery intake → UseCase mapping (pure, deterministic).

   The public intake form (public/discovery.html) collects the QUALITATIVE
   inputs of a use case — problem, data, task, constraints — but deliberately
   NOT the seven 0–5 dimension scores: those are the practitioner's expert
   judgment made in the Evaluate stage. So a submission maps to a Capture-stage
   DRAFT (scores left at blankCase() defaults), not a finished evaluation.

   This module is pure and unit-testable: no DB, no request objects. The API
   route (src/app/api/intake/route.ts) turns a FormData submission into the
   plain Record<string,string> this consumes, then persists the result.
   ============================================================= */

import { blankCase, type UseCase } from "./engine";

/** Raw answers as posted by the form — form field `name` → value. Every value
 *  is a string (FormData); unknown/missing keys are simply absent. */
export type IntakeAnswers = Record<string, string>;

/** Who submitted, plus the free-text the UseCase shape has no home for. Rides
 *  along on the jsonb payload (zod `.passthrough()`), shown to the practitioner
 *  on review; never used by the scoring engine. */
export interface IntakeMeta {
  company: string;
  submitterName: string;
  submitterEmail: string;
  submittedDate: string;
  successNotes: string;
}

/** A use-case payload plus its intake provenance. `source` lets the Library
 *  distinguish client-submitted drafts from practitioner-authored cases. */
export type IntakePayload = UseCase & { source: "intake"; intake: IntakeMeta };

const MAX_LEN = 5000; // hard cap per field — a public endpoint must bound input.

/** Trim, collapse nothing, and cap length. */
function clean(v: string | undefined): string {
  return (v ?? "").toString().slice(0, MAX_LEN).trim();
}

/** Map one radio answer to an engine enum key by keyword.
 *  Matching is lowercase-substring so light wording drift in the form
 *  (e.g. "Real-time (sub-second)" vs "Realtime") still resolves. First match
 *  in `rules` order wins; no match → "" (an unset field, which the engine and
 *  its "input gap" flags already handle gracefully). */
function pick(value: string | undefined, rules: [string, string][]): string {
  const v = (value ?? "").toLowerCase();
  if (!v) return "";
  for (const [needle, key] of rules) {
    if (v.includes(needle)) return key;
  }
  return "";
}

const DATA_FORMAT: [string, string][] = [
  ["document", "documents"], ["unstructured", "documents"],
  ["structured", "structured"], ["table", "structured"], ["database", "structured"], ["db", "structured"],
  ["mixed", "mixed"],
  ["little", "none"], ["none", "none"],
];
const DATA_VOLUME: [string, string][] = [
  ["small", "small"], ["medium", "medium"], ["large", "large"],
];
const DATA_SENSITIVITY: [string, string][] = [
  ["regulated", "regulated"], ["phi", "regulated"], ["financial", "regulated"],
  ["pii", "pii"],
  ["internal", "internal"], ["confidential", "internal"],
  ["public", "none"],
];
const DATA_FRESHNESS: [string, string][] = [
  ["static", "static"], ["rarely", "static"],
  ["periodic", "periodic"], ["updated", "periodic"],
  ["constant", "realtime"], ["real", "realtime"],
];
const LATENCY: [string, string][] = [
  ["batch", "batch"],
  ["interactive", "interactive"],
  ["real", "realtime"], ["sub-second", "realtime"],
];
const OVERSIGHT: [string, string][] = [
  ["every", "required"], ["required", "required"],
  ["spot", "spot-check"], ["sample", "spot-check"],
  ["automated", "none"], ["none", "none"],
];
const TASK_VOLUME: [string, string][] = [
  ["low", "low"], ["medium", "medium"], ["daily", "medium"], ["high", "high"], ["constant", "high"], ["scale", "high"],
];
const TASK_SHAPE: [string, string][] = [
  ["knowledge base", "lookup"], ["answer", "lookup"],
  ["classif", "classify"], ["triage", "classify"], ["route", "classify"],
  ["draft", "generate"], ["generate", "generate"], ["content", "generate"],
  ["action", "actions"], ["other systems", "actions"],
  ["multi-step", "process"], ["process", "process"],
];

/** Build a Capture-stage draft payload from a raw intake submission.
 *
 *  - Free-text fields map straight across (problem, cost, users, outcome,
 *    acceptance bar, data sources, budget, compliance).
 *  - Radio fields translate to engine enum keys via keyword matching.
 *  - The seven scores/weights/thresholds keep blankCase() defaults — the
 *    practitioner sets scores on review; nothing is fabricated here.
 *  - `name` is seeded from the company (or left generic) and is expected to be
 *    edited by the practitioner; it is never a real evaluation input.
 *  - Submitter details + success/adoption notes are preserved in `intake`. */
export function intakeToPayload(a: IntakeAnswers): IntakePayload {
  const base = blankCase();
  const company = clean(a["Company"]);

  const uc: UseCase = {
    ...base,
    name: company ? `Intake — ${company}` : "Intake submission",
    problem: clean(a["Problem"]),
    currentCost: clean(a["Current cost"]),
    users: clean(a["Users"]),
    outcome: clean(a["Desired outcome"]),
    acceptanceBar: clean(a["Acceptance bar"]),
    dataSources: clean(a["Data sources"]),
    dataFormat: pick(a["Data format"], DATA_FORMAT),
    dataVolume: pick(a["Data volume"], DATA_VOLUME),
    dataSensitivity: pick(a["Data sensitivity"], DATA_SENSITIVITY),
    dataFreshness: pick(a["Data freshness"], DATA_FRESHNESS),
    latency: pick(a["Latency"], LATENCY),
    budget: clean(a["Budget"]),
    compliance: clean(a["Compliance"]),
    oversight: pick(a["Oversight"], OVERSIGHT),
    taskVolume: pick(a["Task volume"], TASK_VOLUME),
    taskShape: pick(a["Task shape"], TASK_SHAPE),
  };

  const meta: IntakeMeta = {
    company,
    submitterName: clean(a["Your name"]),
    submitterEmail: clean(a["email"]),
    submittedDate: clean(a["Date"]),
    successNotes: clean(a["Success and adoption notes"]),
  };

  return { ...uc, source: "intake", intake: meta };
}

/** Honeypot: the form ships a hidden `botcheck` field a human never fills.
 *  Any non-empty value ⇒ almost certainly a bot. */
export function isBotSubmission(a: IntakeAnswers): boolean {
  return clean(a["botcheck"]).length > 0;
}

/** A submission with no problem statement is empty noise — reject it so the
 *  Library isn't polluted by blank/accidental posts. */
export function hasMinimumContent(a: IntakeAnswers): boolean {
  return clean(a["Problem"]).length > 0;
}
