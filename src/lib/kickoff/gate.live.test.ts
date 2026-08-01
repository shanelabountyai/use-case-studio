/* LAUNCH GATE — live, and therefore SKIPPED BY DEFAULT.
 *
 * This is the BK-7 launch-blocking check: does the real critic actually catch
 * planted fabrications, and does it leave an honest plan alone? It makes real
 * Claude calls and spends real money, so it only runs when you ask for it:
 *
 *     env -u ANTHROPIC_API_KEY BK_LIVE=1 npx vitest run src/lib/kickoff/gate.live.test.ts
 *
 * The `env -u` matters: dotenv does NOT override an already-set shell variable,
 * so a stale exported ANTHROPIC_API_KEY silently shadows the one in .env and the
 * run dies on a 401 that looks like a bad key in .env. Unset it and .env wins.
 *
 * Re-run it after ANY planner/critic prompt edit (i.e. whenever
 * PROMPT_ROSTER_VERSION changes) — a prompt change can silently break the
 * critic's specificity, which is exactly what this gate exists to catch.
 *
 * Cost at the BK-3 measured rate: ~6 critic calls per grounding, ~$1/grounding.
 */

import "dotenv/config";
import { describe, it, expect } from "vitest";
import { criticFabricationGate } from "./harness";
import { realCritic } from "./claude";
import { serializeGrounding } from "./grounding";
import { kickoffModel } from "./pricing";
import { CASE_POLICY_LOOKUP, CASE_INVOICE_CLASSIFY } from "./fixtures";

const live = process.env.BK_LIVE === "1" && !!process.env.ANTHROPIC_API_KEY;

const CASES = [
  { label: "policy-lookup (BUILD)", id: "00000000-0000-4000-8000-0000000000c0", uc: CASE_POLICY_LOOKUP },
  { label: "invoice-classify (REFINE)", id: "00000000-0000-4000-8000-0000000000c1", uc: CASE_INVOICE_CLASSIFY },
];

describe.skipIf(!live)(`critic fabrication gate — LIVE (${kickoffModel()})`, () => {
  for (const c of CASES) {
    it(
      `catches every planted fabrication and spares the clean plan: ${c.label}`,
      async () => {
        const g = serializeGrounding(c.id, c.uc);
        const report = await criticFabricationGate(realCritic, g);

        // Printed so a failing run tells you WHICH fabrication slipped through.
        console.log(`\n── ${c.label} — verdict ${g.verdict} ──`);
        for (const r of report.results)
          console.log(`  ${r.caught ? "CAUGHT " : "MISSED "} ${r.kind.padEnd(20)} ${r.detail}`);
        console.log(`  CONTROL ${report.control.falsePositive ? "FALSE-POSITIVE" : "clean"}: ${report.control.detail}`);
        console.log(`  => ${report.pass ? "PASS" : "FAIL"}`);

        for (const r of report.results) expect(r.caught, `${r.kind}: ${r.detail}`).toBe(true);
        expect(report.control.falsePositive, report.control.detail).toBe(false);
        expect(report.pass).toBe(true);
      },
      600_000,
    );
  }
});
