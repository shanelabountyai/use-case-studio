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

/* Overclaim detection, in two tiers.

   The single-list version of this flagged `enforced`, `ensure`, and `prevents`
   on sight, which failed a live plan on "audience-restricted content filters can
   be enforced if any exist" — correctly-hedged engineering prose. Those are
   ordinary security verbs ("access controls are enforced at the retrieval
   layer"), and an invariant that fires on honest plans means no real run passes
   the launch gate, which teaches people to ignore the check. */

/** Unambiguous overclaims: claims however they are phrased. "guarantee" is NOT
 *  here — live plans use it honestly all the time ("no guarantee is implied",
 *  "rather than a guaranteed run rate", "a documented deferral guarantee"), so
 *  it's treated as scoped below (only a claim when it guarantees an absolute
 *  outcome). "zero errors"/"100% accurate"/"never fails" remain unambiguous. */
const ABSOLUTE_CLAIM = /\b(never fails?|100%\s+accurate|zero\s+errors?)\b/i;

/** Softer/scoped verbs only read as an overclaim when bound to an absolute scope.
 *  The quantifier must follow immediately, so "guarantees zero errors" and
 *  "prevents any leakage" trip, while "a deferral guarantee" and "enforced if
 *  any exist" do not. */
const SCOPED_CLAIM = /\b(ensur\w*|prevent\w*|enforc\w*|guarantee\w*)\s+(all|any|every|no|zero|100%)\b/i;

// A performance/cost/latency metric token: a percentage, a dollar figure, or a
// millisecond figure. Standalone plain integers are intentionally NOT matched —
// too noisy (counts, versions, week numbers).
const METRIC = /\d+(?:\.\d+)?\s?%|\$\s?\d[\d,]*(?:\.\d+)?|\d+\s?ms\b/gi;

// Framing that makes a metric a target/estimate/analysis rather than a claimed
// achieved benchmark. Broadened after a live run flagged "defers 40% of
// documents" — honest analytical prose. Proportions ("X% of …") are handled
// structurally in flagUnlabeledMetrics; these are the lexical hedges/targets.
// Deliberately excludes over-common words (about/around/rate) that could
// coincidentally sit next to a real fabrication.
const LABEL = /estimate|example|e\.g\.|illustrative|approx|~|target|acceptance bar|golden set|held-out|roughly|approximately|per[- ]category|threshold|budget|baseline|improvement|reduction|deferral|defer/i;

/** Numeric tokens drawn from the case's acceptance bar — these are legitimate
 *  targets, never fabrications, so the plan may echo them freely. */
function barMetrics(bar: string): string[] {
  return (bar.match(METRIC) ?? []).map((s) => s.replace(/\s+/g, ""));
}

// Negation/disclaimer words that turn an overclaim into an honest hedge ("no
// guarantee is implied", "we cannot guarantee X"). Excludes "never" — "never
// fails" is itself a claim, not a negation.
const NEGATION = /\b(no|not|without|cannot|can't|cant|don't|dont|doesn't|doesnt|isn't|isnt|aren't|arent|won't|wont|neither|nor|avoid)\b/i;

/** Guarantee-language hits (must be zero). A match is spared when negated in its
 *  OWN clause — scoped to the text since the last `.`/`;` so a negation in an
 *  earlier clause ("no risk; the system guarantees…") doesn't wrongly spare it. */
export function flagGuarantees(text: string): string[] {
  const hits: string[] = [];
  for (const re of [ABSOLUTE_CLAIM, SCOPED_CLAIM])
    for (const m of text.matchAll(new RegExp(re.source, "gi"))) {
      const i = m.index ?? 0;
      const clause = text.slice(Math.max(0, i - 60), i).split(/[.;]/).pop() ?? "";
      if (NEGATION.test(clause)) continue;
      hits.push(m[0]);
    }
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
    // "X% of <noun>" is a proportion (honest analysis: "defers 40% of docs"),
    // not a fabricated achieved benchmark — exempt it structurally.
    if (/^\s*of\b/i.test(text.slice(i + m[0].length, i + m[0].length + 6))) continue;
    const window = text.slice(Math.max(0, i - 40), i + m[0].length + 40);
    if (!LABEL.test(window)) out.push(m[0]);
  }
  return out;
}

/* Evaluation assets the plan can lean on but must also CREATE.

   Found by hand-writing PRDs from a generated package (Aug 2026). The grants plan
   leaned on a golden set in six of seven phases — "run the full golden set", "10
   golden-set briefs" — and no milestone assembled it, so the first build phase
   started with nothing to run against and the PRD had to patch the hole by hand.

   The planner is INCONSISTENT here, not uniformly broken: checked against the
   same generator's other two packages, the FNOL plan gave the asset a dedicated
   phase ("Phase 1 — Golden set and audit record — Build the stratified 400-claim
   labeled set") and support-ticket assigned it too. One in three shipped without
   it, which is exactly what a deterministic invariant is for — the prompt rule
   (provider bk-3) raises the floor, this catches the run where it doesn't take.

   Naming the asset in the evaluation section is NOT ownership: the grants plan
   said "Assemble 50–100 scored items" in prose and still left it off every
   milestone. So the check is milestone-scoped on purpose — a phase has a
   duration and an ownerOfRisk, and prose has neither.

   ponytail: lexical match per milestone — an asset noun and a creation verb in
   the same milestone passes, even if that phase isn't really the producer.
   Tighten only if a real run shows a false pass; false passes are the safer
   direction here, since an invariant that fails honest plans teaches people to
   ignore the gate (see the guarantee-detector scar tissue above). */
const EVAL_ASSET = /golden set|golden corpus|held[- ]out\s+\w*\s*(?:set|split|sample)|labell?ed set|evaluation set|eval set/i;

/** Verbs that make a milestone the asset's producer rather than its consumer.
 *  "run"/"score"/"generate" are deliberately absent — consuming a golden set is
 *  what every later phase does, and counting that as ownership would pass the
 *  exact plans this was written to catch. */
const ASSET_CREATION = /\b(assembl|curat|author|construct|compil|collect|label|creat|source|gather|populat)\w*/i;

/** Milestone text, per milestone (the granularity the ownership check needs —
 *  planText flattens all of them together, which would let one phase's verb
 *  launder another phase's asset). */
function milestoneTexts(p: IntegratedPlan): string[] {
  return p.milestones.map(
    (m) => `${m.phase} ${m.goal} ${m.exitCriterion} ${m.duration ?? ""} ${m.ownerOfRisk ?? ""}`,
  );
}

/** Does some single milestone both name an evaluation asset and take
 *  responsibility for producing it? Vacuously true when the plan never leans on
 *  one — a plan with no golden set has nothing to own. */
export function evalAssetOwned(p: IntegratedPlan): boolean {
  if (!EVAL_ASSET.test(planText(p))) return true;
  return milestoneTexts(p).some((t) => EVAL_ASSET.test(t) && ASSET_CREATION.test(t));
}

// Per-taskShape evaluation vocabulary that a real plan for that shape must name.
const EVAL_VOCAB: Record<string, RegExp> = {
  lookup: /golden set|citation|refus/i,
  classify: /confusion|recall|threshold|calibrat|per-category/i,
  actions: /injection|rollback|permission|action[- ]safety/i,
  process: /stage check|integration|end-to-end/i,
  generate: /rubric|llm-as-judge|judge/i,
};

/* Architecture families (BK-3). The planner is told to echo the engine's
   recommended pattern verbatim; this catches the case where it substitutes a
   different one instead of expanding it. Matching is by FAMILY, not string
   equality, so a legitimate restatement ("a RAG pipeline over the policy
   corpus") still passes while a genuine swap (RAG → fine-tuned classifier)
   fails. Ordered: the first hit wins, so "grounded with RAG" reads as rag
   before it reads as prompting. */
const ARCH_FAMILIES: [family: string, test: RegExp][] = [
  ["rag", /\brag\b|retrieval[- ]augmented|retrieval layer/i],
  ["agent", /tool[- ]use|function[- ]calling|\bagent\b/i],
  ["workflow", /orchestrat|workflow|pipeline of steps/i],
  ["fine-tune", /fine[- ]tun/i],
  ["prompting", /direct prompting|prompt(ing)? with/i],
];

/** The architecture family a pattern string belongs to, or null when it doesn't
 *  match any known family (unclassifiable ⇒ we don't cry wolf). */
export function architectureFamily(pattern: string): string | null {
  return ARCH_FAMILIES.find(([, re]) => re.test(pattern))?.[0] ?? null;
}

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
  const planFamily = architectureFamily(plan.architecturePattern);
  const groundFamily = architectureFamily(g.recommendation.architecturePattern);
  const assetOwned = evalAssetOwned(plan);
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
      name: "eval-asset-owned",
      pass: assetOwned,
      detail: assetOwned
        ? "evaluation assets are produced by a milestone (or none are used)"
        : "plan depends on a golden/held-out set that no milestone assembles",
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
      name: "architecture-family-match",
      pass: planFamily === null || groundFamily === null || planFamily === groundFamily,
      detail:
        planFamily && groundFamily && planFamily !== groundFamily
          ? `plan pattern "${plan.architecturePattern}" (${planFamily}) ≠ recommended "${g.recommendation.architecturePattern}" (${groundFamily})`
          : "plan expands the recommended architecture",
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
