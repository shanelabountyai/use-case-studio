/* =============================================================
   Build Kickoff — structural invariant detectors (BK-7 scaffold).

   The deterministic half of the launch gate: pure checks over an IntegratedPlan
   + CriticAudit + GroundingInput. These do NOT judge prose quality (that's the
   validated LLM-judge, wired in the live harness) — they assert structure:

     must-include  — acceptance bar referenced (spine), taskShape eval
                     vocabulary present, a well-formed critic verdict.
     must-NOT-include — guarantee words; bare %/$/ms metrics that aren't the
                     case's own acceptance-bar target and carry no estimate/
                     example label (the fabricated-benchmark smell).

   Fully unit-testable offline, so a prompt edit that flips an invariant fails
   the gate without a live call.
   ============================================================= */

import type { IntegratedPlan, CriticAudit, GroundingInput } from "./contracts";

export interface InvariantResult {
  name: string;
  pass: boolean;
  detail: string;
}

/** All human-readable text in a plan, flattened. */
export function planText(p: IntegratedPlan): string {
  const sections = Object.values(p.sections)
    .filter((s): s is { heading: string; markdown: string } => Boolean(s))
    .map((s) => `${s.heading}\n${s.markdown}`);
  const flows = p.dataFlows.map((f) => `${f.name}: ${f.steps.join(" ")}`);
  const miles = p.milestones.map(
    (m) => `${m.phase} ${m.goal} ${m.exitCriterion} ${m.duration ?? ""} ${m.ownerOfRisk ?? ""}`,
  );
  return [p.executiveSummary, ...sections, ...flows, ...miles, ...p.assumptions].join("\n");
}

const GUARANTEE =
  /\b(guarantee[sd]?|guaranteeing|ensure[sd]?|enforced|prevents?|prevented|never fails?|100%\s+accurate|zero\s+errors?)\b/i;

// A performance/cost/latency metric token: a percentage, a dollar figure, or a
// millisecond figure. Standalone plain integers are intentionally NOT matched —
// too noisy (counts, versions, week numbers).
const METRIC = /\d+(?:\.\d+)?\s?%|\$\s?\d[\d,]*(?:\.\d+)?|\d+\s?ms\b/gi;

// Words that make a number a declared estimate/example rather than a claim.
const LABEL = /estimate|example|e\.g\.|illustrative|approx|~|target|acceptance bar|golden set|held-out/i;

/** Numeric tokens drawn from the case's acceptance bar — these are legitimate
 *  targets, never fabrications, so the plan may echo them freely. */
function barMetrics(bar: string): string[] {
  return (bar.match(METRIC) ?? []).map((s) => s.replace(/\s+/g, ""));
}

/** Guarantee-language hits (must be zero). */
export function flagGuarantees(text: string): string[] {
  const hits: string[] = [];
  for (const m of text.matchAll(new RegExp(GUARANTEE, "gi"))) hits.push(m[0]);
  return hits;
}

/** Metric tokens that are neither the acceptance-bar target nor labeled as an
 *  estimate/example — the fabricated-benchmark smell (must be zero). */
export function flagUnlabeledMetrics(text: string, allowed: string[]): string[] {
  const allow = new Set(allowed);
  const out: string[] = [];
  for (const m of text.matchAll(METRIC)) {
    const tok = m[0].replace(/\s+/g, "");
    if (allow.has(tok)) continue;
    const i = m.index ?? 0;
    const window = text.slice(Math.max(0, i - 40), i + m[0].length + 40);
    if (!LABEL.test(window)) out.push(m[0]);
  }
  return out;
}

// Per-taskShape evaluation vocabulary that a real plan for that shape must name.
const EVAL_VOCAB: Record<string, RegExp> = {
  lookup: /golden set|citation|refus/i,
  classify: /confusion|recall|threshold|calibrat|per-category/i,
  actions: /injection|rollback|permission|action[- ]safety/i,
  process: /stage check|integration|end-to-end/i,
  generate: /rubric|llm-as-judge|judge/i,
};

/** Does the plan reference the acceptance bar (its number, else a distinctive
 *  long word)? A cheap structural proxy for "the bar is the spine." */
function referencesBar(text: string, bar: string): boolean {
  const nums = barMetrics(bar);
  const t = text.replace(/\s+/g, "");
  if (nums.length) return nums.some((n) => t.includes(n));
  const words = (bar.toLowerCase().match(/[a-z]{7,}/g) ?? []).slice(0, 5);
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w));
}

/** Run all deterministic invariants for one plan + audit. */
export function checkPlanInvariants(
  plan: IntegratedPlan,
  audit: CriticAudit | null,
  g: GroundingInput,
): InvariantResult[] {
  const text = planText(plan);
  const guarantees = flagGuarantees(text);
  const unlabeled = flagUnlabeledMetrics(text, barMetrics(g.acceptanceBar));
  const vocab = EVAL_VOCAB[g.taskShape];
  const results: InvariantResult[] = [
    {
      name: "acceptance-bar-spine",
      pass: g.acceptanceBar.trim() === "" || referencesBar(text, g.acceptanceBar),
      detail: "plan references the acceptance bar",
    },
    {
      name: "eval-vocabulary",
      pass: !vocab || vocab.test(text),
      detail: `taskShape=${g.taskShape || "(none)"} eval vocabulary present`,
    },
    {
      name: "no-guarantees",
      pass: guarantees.length === 0,
      detail: guarantees.length ? `guarantee language: ${guarantees.join(", ")}` : "none",
    },
    {
      name: "no-unlabeled-metrics",
      pass: unlabeled.length === 0,
      detail: unlabeled.length ? `unlabeled metrics: ${unlabeled.join(", ")}` : "none",
    },
    {
      name: "critic-verdict-wellformed",
      pass:
        !!audit &&
        ["SHIP AS-IS", "SHIP WITH FIXES", "NEEDS REWORK"].includes(audit.verdict) &&
        audit.gaps.length >= 1 &&
        audit.topFixes.length <= 3,
      detail: audit ? `critic verdict ${audit.verdict}` : "no audit attached",
    },
  ];
  return results;
}
