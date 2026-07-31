/* Build Kickoff — LLM-as-judge + its validation gate (BK-7 live half).

   The structural invariants (invariants.ts) catch what regex can: guarantees,
   unlabeled metrics, missing eval vocabulary. They can't judge prose quality —
   is the plan actually grounded, actionable, and honest? That's the LLM-judge.

   A judge is only useful if it agrees with people. So the judge does NOT gate
   launch until it has been validated against a human-rated set: judgePlan scores
   the same plans a human scored, and judgeAgreement measures how close they are.
   Below the agreement thresholds the judge is `trusted: false` — build the
   labeled set, re-run, and only lean on the judge once it clears the bar. */

import { z } from "zod/v4";
import { callStructured } from "./claude";
import type { IntegratedPlan, CriticAudit, GroundingInput } from "./contracts";

const Score = z.number().int().min(1).max(5);

/** One judged plan. Sub-scores make the overall score auditable; `overall` is
 *  what we validate against human ratings (same 1–5 scale). */
export const JudgeScore = z.object({
  overall: Score, // holistic usefulness of the plan as a build kickoff
  groundedness: Score, // stays within the grounding; nothing invented
  actionability: Score, // concrete, implementable milestones/architecture
  barAlignment: Score, // the acceptance bar is the spine of the plan
  honesty: Score, // estimates labeled; no overclaims/guarantees
  rationale: z.string().min(1),
});
export type JudgeScore = z.infer<typeof JudgeScore>;

const JUDGE_MAX_TOKENS = 4_000;

const JUDGE_SYSTEM = `You are an expert reviewer scoring a build kickoff plan for quality. Score each dimension 1–5 (integers only; 1 = poor, 3 = adequate, 5 = excellent), then give an overall 1–5 and a one-sentence rationale.

Dimensions:
- groundedness: does the plan stay within what the grounding supports, inventing no facts, vendors, or numbers?
- actionability: are the milestones, exit criteria, and architecture concrete enough to build from?
- barAlignment: is the case's acceptanceBar the through-line — do milestones ladder toward it?
- honesty: are estimates labeled as estimates, with no guarantees/overclaims?
- overall: holistic usefulness as a kickoff for an engineering team.

Judge the plan as written against its grounding. Do not reward length or confident tone. Return only JSON matching the schema.`;

export interface JudgeResult {
  score: JudgeScore;
  inputTokens: number;
  outputTokens: number;
}

export type Judge = (
  plan: IntegratedPlan,
  audit: CriticAudit | null,
  g: GroundingInput,
) => Promise<JudgeResult>;

/** Score one plan with the Claude judge. */
export const judgePlan: Judge = async (plan, audit, g) => {
  const { data, inputTokens, outputTokens } = await callStructured(
    JudgeScore,
    JUDGE_SYSTEM,
    `Score this plan.\n\nGROUNDING:\n${JSON.stringify(g, null, 2)}\n\nCRITIC AUDIT (if any):\n${JSON.stringify(audit, null, 2)}\n\nPLAN:\n${JSON.stringify(plan, null, 2)}`,
    JUDGE_MAX_TOKENS,
  );
  return { score: data, inputTokens, outputTokens };
};

/* ─────────────────────── Validation against humans ─────────────────────── */

/** Trust thresholds — the judge gates launch only once it clears all three.
 *  ponytail: within-1 agreement + MAE, not a full ICC. Upgrade the statistic if
 *  a within-1 rate ever hides systematic bias the correlation would show. */
export const JUDGE_TRUST = { minN: 10, maxMae: 1.0, minWithinOne: 0.8, minCorrelation: 0.5 };

export interface AgreementReport {
  n: number;
  mae: number; // mean absolute error, judge vs human (1–5 scale)
  withinOne: number; // fraction of pairs within ±1
  correlation: number | null; // Pearson r; null when undefined (n<2 or no variance)
  trusted: boolean;
}

/** Pure agreement math over (human, judge) overall-score pairs. */
export function judgeAgreement(
  pairs: { human: number; judge: number }[],
  trust = JUDGE_TRUST,
): AgreementReport {
  const n = pairs.length;
  if (n === 0) return { n, mae: NaN, withinOne: NaN, correlation: null, trusted: false };

  const mae = pairs.reduce((s, p) => s + Math.abs(p.human - p.judge), 0) / n;
  const withinOne = pairs.filter((p) => Math.abs(p.human - p.judge) <= 1).length / n;
  const correlation = pearson(pairs.map((p) => p.human), pairs.map((p) => p.judge));

  const trusted =
    n >= trust.minN &&
    mae <= trust.maxMae &&
    withinOne >= trust.minWithinOne &&
    correlation !== null &&
    correlation >= trust.minCorrelation;

  return { n, mae, withinOne, correlation, trusted };
}

/** Pearson correlation; null if undefined (fewer than 2 points, or either side
 *  is constant so the denominator is zero). */
function pearson(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n < 2) return null;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? null : num / den;
}

/** One human-rated plan: the plan/audit/grounding a person scored, plus their
 *  overall 1–5. This is the labeled set BK-7 needs — supply ≥ JUDGE_TRUST.minN. */
export interface LabeledPlan {
  plan: IntegratedPlan;
  audit: CriticAudit | null;
  grounding: GroundingInput;
  humanScore: number; // overall 1–5
}

/** Run the judge over a labeled set and report agreement. `judge` is injected so
 *  this is unit-testable with a fake scorer (no LLM). */
export async function validateJudge(
  labeled: LabeledPlan[],
  judge: Judge = judgePlan,
): Promise<AgreementReport & { pairs: { human: number; judge: number }[] }> {
  const scored = await Promise.all(
    labeled.map(async (l) => ({
      human: l.humanScore,
      judge: (await judge(l.plan, l.audit, l.grounding)).score.overall,
    })),
  );
  return { ...judgeAgreement(scored), pairs: scored };
}
