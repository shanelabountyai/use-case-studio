/* FULL PIPELINE — live, SKIPPED BY DEFAULT.
 *
 * Runs a real planner + critic end to end and reports measured tokens, USD, and
 * latency (the BK-3 cap numbers), then scores the REAL plan against the
 * structural invariants — the "run-success on the corpus" half of the BK-7
 * launch gate. Unlike gate.live.test.ts, which grades the critic against planted
 * fabrications, this grades what the planner actually produces.
 *
 *     env -u ANTHROPIC_API_KEY BK_LIVE=1 npx vitest run src/lib/kickoff/pipeline.live.test.ts
 *
 * The `env -u` matters: dotenv does not override an exported shell variable, so
 * a stale ANTHROPIC_API_KEY shadows .env and the run dies on a 401.
 *
 * Cost: roughly $0.45–0.60 per case at the measured rate.
 */

import "dotenv/config";
import { describe, it, expect } from "vitest";
import { realPlanner, realCritic } from "./claude";
import { serializeGrounding } from "./grounding";
import { checkPlanInvariants } from "./invariants";
import { getLimits } from "./limits";
import { kickoffModel, priceUsd } from "./pricing";
import { evaluate } from "../engine";
import { CASE_POLICY_LOOKUP } from "./fixtures";

// The two stages are driven directly rather than through executeJob: worker.ts
// pulls in the DB layer, which a live measurement has no business touching (and
// every other test mocks). The orchestration executeJob adds — verdict echo,
// token cap, lane status — is asserted explicitly below instead.

const live = process.env.BK_LIVE === "1" && !!process.env.ANTHROPIC_API_KEY;

// REFINE/invoice-classify was measured at ~$0.44/run; policy-lookup (BUILD) is
// the larger grounding and was the outstanding half of the BK-3 cap numbers.
const CASES = [
  { label: "policy-lookup (BUILD)", id: "00000000-0000-4000-8000-0000000000c0", uc: CASE_POLICY_LOOKUP },
];

describe.skipIf(!live)(`full pipeline — LIVE (${kickoffModel()})`, () => {
  for (const c of CASES) {
    it(
      `produces a complete, invariant-clean plan within the caps: ${c.label}`,
      async () => {
        const limits = getLimits();
        const { verdict } = evaluate(c.uc);
        const g = serializeGrounding(c.id, c.uc);

        const t0 = Date.now();
        const p = await realPlanner(g);
        const plannerMs = Date.now() - t0;

        const t1 = Date.now();
        const a = await realCritic(p.plan, g);
        const criticMs = Date.now() - t1;

        const inTok = p.inputTokens + a.inputTokens;
        const outTok = p.outputTokens + a.outputTokens;
        const tokens = inTok + outTok;
        const usd = priceUsd(kickoffModel(), inTok, outTok);

        console.log(`\n── ${c.label} — verdict ${verdict} ──`);
        console.log(`  planner  ${p.inputTokens} in / ${p.outputTokens} out — ${(plannerMs / 1000).toFixed(1)}s`);
        console.log(`  critic   ${a.inputTokens} in / ${a.outputTokens} out — ${(criticMs / 1000).toFixed(1)}s`);
        console.log(`  total    ${tokens} tokens (cap ${limits.tokenCap}) — $${usd.toFixed(4)} — ${((plannerMs + criticMs) / 1000).toFixed(1)}s (timeout ${limits.timeoutMs / 1000}s)`);
        console.log(`  critic verdict: ${a.audit.verdict}`);

        // Dump the artifact so a failure can be diagnosed without paying for
        // another run. BK_ARTIFACT_DIR is opt-in; nothing is written by default.
        const dir = process.env.BK_ARTIFACT_DIR;
        if (dir) {
          const { writeFileSync } = await import("node:fs");
          const file = `${dir}/plan-${c.uc.taskShape}-${Date.now()}.json`;
          writeFileSync(file, JSON.stringify({ plan: p.plan, audit: a.audit }, null, 2));
          console.log(`  artifact ${file}`);
        }

        const results = checkPlanInvariants(p.plan, a.audit, g);
        for (const r of results) console.log(`  ${r.pass ? "PASS" : "FAIL"} ${r.name.padEnd(26)} ${r.detail}`);

        // The server verdict wins — the planner must echo it, never re-decide.
        expect(p.plan.verdict).toBe(verdict);
        expect(results.filter((r) => !r.pass).map((r) => `${r.name}: ${r.detail}`)).toEqual([]);
        expect(tokens).toBeLessThanOrEqual(limits.tokenCap);
        // A single stage must also fit inside the worker's wall clock.
        expect(Math.max(plannerMs, criticMs)).toBeLessThan(limits.timeoutMs);
      },
      600_000,
    );
  }
});
