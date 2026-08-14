/* RUN-SUCCESS SAMPLING — live, SKIPPED BY DEFAULT.
 *
 * The BK-7 launch gate asks for ">=95% run-success on the corpus". A single run
 * cannot show that, and planner output varies between runs of the same fixture,
 * so this samples N runs across both plan cases and reports the rate plus which
 * invariants flake.
 *
 *     env -u ANTHROPIC_API_KEY BK_LIVE=1 npx vitest run src/lib/kickoff/runsuccess.live.test.ts
 *
 * BK_RUNS   total runs (default 4, split evenly across the two fixtures). Was
 *           10, which overran the 540s test timeout — this is a sampler, and
 *           4 runs cost ~$1.60 instead of ~$4 for the same signal.
 * BK_CONC   concurrent runs (default 5) — measurement only; production caps
 *           per-user concurrency at 1 (KICKOFF_MAX_CONCURRENT).
 *
 * Cost ~$0.40/run, so the default is ~$1.60 and ~3 minutes.
 *
 * ON STATISTICAL POWER: 10 clean runs do NOT establish a 95% success rate. With
 * zero failures in n trials the rule of three puts the 95% upper bound on the
 * failure rate at 3/n — so 10/10 is consistent with a true rate as low as ~70%,
 * and certifying >=95% needs n>=60 (~$24). Treat this as a smoke estimate that
 * catches gross flakiness, and read the per-invariant table for what actually
 * moves.
 */

import "dotenv/config";
import { describe, it, expect } from "vitest";
import { realPlanner, realCritic } from "./claude";
import { serializeGrounding } from "./grounding";
import { checkPlanInvariants } from "./invariants";
import { getLimits } from "./limits";
import { kickoffModel, priceUsd } from "./pricing";
import { evaluate } from "../engine";
import { CASE_POLICY_LOOKUP, CASE_INVOICE_CLASSIFY } from "./fixtures";
import type { UseCase } from "../engine";

const live = process.env.BK_LIVE === "1" && !!process.env.ANTHROPIC_API_KEY;
const RUNS = Number(process.env.BK_RUNS ?? 4);
const CONC = Number(process.env.BK_CONC ?? 5);

const FIXTURES: { label: string; id: string; uc: UseCase }[] = [
  { label: "lookup/BUILD", id: "00000000-0000-4000-8000-0000000000c0", uc: CASE_POLICY_LOOKUP },
  { label: "classify/REFINE", id: "00000000-0000-4000-8000-0000000000c1", uc: CASE_INVOICE_CLASSIFY },
];

interface RunResult {
  label: string;
  ok: boolean;
  failures: string[];
  tokens: number;
  usd: number;
  ms: number;
  error?: string;
}

async function oneRun(f: (typeof FIXTURES)[number]): Promise<RunResult> {
  const started = Date.now();
  try {
    const g = serializeGrounding(f.id, f.uc);
    const { verdict } = evaluate(f.uc);
    const p = await realPlanner(g);
    const a = await realCritic(p.plan, g);
    const inTok = p.inputTokens + a.inputTokens;
    const outTok = p.outputTokens + a.outputTokens;

    const failures = checkPlanInvariants(p.plan, a.audit, g)
      .filter((r) => !r.pass)
      .map((r) => r.name);
    // A drifted verdict is a run failure too, not just an invariant miss.
    if (p.plan.verdict !== verdict) failures.push("verdict-echo");

    return {
      label: f.label,
      ok: failures.length === 0,
      failures,
      tokens: inTok + outTok,
      usd: priceUsd(kickoffModel(), inTok, outTok),
      ms: Date.now() - started,
    };
  } catch (e) {
    // A thrown stage (schema miss after retry, refusal, timeout) is a failed run.
    return {
      label: f.label,
      ok: false,
      failures: ["threw"],
      tokens: 0,
      usd: 0,
      ms: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

describe.skipIf(!live)(`run-success sampling — LIVE (${kickoffModel()})`, () => {
  it(
    `${RUNS} runs across the corpus`,
    async () => {
      const queue = Array.from({ length: RUNS }, (_, i) => FIXTURES[i % FIXTURES.length]);
      const results: RunResult[] = [];

      for (let i = 0; i < queue.length; i += CONC) {
        const wave = queue.slice(i, i + CONC);
        results.push(...(await Promise.all(wave.map(oneRun))));
        console.log(`  …${results.length}/${RUNS} done`);
      }

      const ok = results.filter((r) => r.ok).length;
      const rate = ok / results.length;
      const usd = results.reduce((s, r) => s + r.usd, 0);
      const toks = results.filter((r) => r.tokens).map((r) => r.tokens);
      const secs = results.map((r) => r.ms / 1000);
      const span = (xs: number[]) =>
        xs.length ? `${Math.min(...xs).toFixed(0)}–${Math.max(...xs).toFixed(0)} (mean ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(0)})` : "n/a";

      // Which invariants actually flake, and on which fixture.
      const byFailure: Record<string, string[]> = {};
      for (const r of results)
        for (const f of r.failures) (byFailure[f] ??= []).push(r.label);

      console.log(`\n── run-success over ${results.length} runs ──`);
      console.log(`  passed   ${ok}/${results.length}  (${(rate * 100).toFixed(0)}%)`);
      console.log(`  tokens   ${span(toks)}   (cap ${getLimits().tokenCap})`);
      console.log(`  latency  ${span(secs)}s  (timeout ${getLimits().timeoutMs / 1000}s)`);
      console.log(`  spend    $${usd.toFixed(2)} total, $${(usd / results.length).toFixed(3)}/run`);
      for (const [name, where] of Object.entries(byFailure))
        console.log(`  FLAKE    ${name.padEnd(26)} ${where.length}× — ${where.join(", ")}`);
      for (const r of results.filter((r) => r.error)) console.log(`  ERROR    ${r.label}: ${r.error}`);
      console.log(
        `\n  NOTE: ${ok}/${results.length} does not establish >=95%. Rule of three puts the 95%`,
      );
      console.log(`  upper bound on the failure rate at ${(3 / results.length * 100).toFixed(0)}% with zero failures.`);

      expect(rate).toBeGreaterThanOrEqual(0.95);
    },
    540_000,
  );
});
