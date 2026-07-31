/* Model selection + USD attribution for Build Kickoff (BK-3/BK-6).

   One place to answer "which model runs the pipeline" and "what did a run cost".
   The worker was landing usd:0 placeholders (BK-1); with the real stages live it
   prices each run from measured tokens. */

/** Per-model price in USD per 1M tokens (input, output). First-party API rates. */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/** The pipeline model. Env-overridable so the model can be tuned without a
 *  deploy; defaults to the Opus tier (correctness-critical planner + critic). */
export function kickoffModel(): string {
  return process.env.KICKOFF_MODEL || "claude-opus-5";
}

/** USD for a run. Unknown model → 0 (telemetry only; never gates behavior).
 *  ponytail: flat per-token math, no cache/tier accounting — add if the bill
 *  ever needs to reconcile to the penny. */
export function priceUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (inputTokens / 1e6) * p.input + (outputTokens / 1e6) * p.output;
}
