/* BK-7 LLM-judge validation runner — turns the "collect human ratings" step into
 * a two-command loop. Makes real Claude calls; loads .env automatically.
 *
 *   1. npx tsx scripts/judge-validate.mts emit [out.json]
 *        Runs the real pipeline over the golden corpus and writes a ratings
 *        template (each entry has humanScore: null). A person scores each plan
 *        1–5 (overall usefulness) and fills in humanScore.
 *
 *   2. npx tsx scripts/judge-validate.mts check [ratings.json]
 *        Runs the judge over the rated plans and reports judge-vs-human
 *        agreement. Exit 0 only if the judge clears JUDGE_TRUST (n, MAE,
 *        within-1, correlation) — i.e. the judge is safe to rely on.
 *
 * The P0 corpus has only 2 plan-cases; the gate needs n ≥ JUDGE_TRUST.minN, so
 * top up the rated file with real/P1 plans before `check` can pass.
 */

import { config as loadEnv } from "dotenv";
import fs from "node:fs";

// override:true so the project's .env wins over an ambient ANTHROPIC_API_KEY in
// the shell (e.g. a host tool's own key) — otherwise the runner silently calls
// the API with the wrong key and 401s.
loadEnv({ override: true });
import { GOLDEN_CORPUS } from "../src/lib/kickoff/harness";
import { serializeGrounding } from "../src/lib/kickoff/grounding";
import { realPlanner, realCritic } from "../src/lib/kickoff/claude";
import { kickoffModel } from "../src/lib/kickoff/pricing";
import { validateJudge, JUDGE_TRUST, type LabeledPlan } from "../src/lib/kickoff/judge";

const DEFAULT_FILE = "docs/build-kickoff/human-ratings.json";
const mode = process.argv[2];
const file = process.argv[3] || DEFAULT_FILE;

function requireKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set (add it to .env or the environment).");
    process.exit(2);
  }
}

async function emit() {
  requireKey();
  const CASE_ID = "00000000-0000-4000-8000-0000000000e0";
  const out: (LabeledPlan & { name: string; humanScore: number | null })[] = [];
  for (const c of GOLDEN_CORPUS) {
    if (c.expect !== "plan") continue;
    const g = serializeGrounding(CASE_ID, c.uc);
    console.log(`generating: ${c.name} …`);
    const { plan } = await realPlanner(g);
    const { audit } = await realCritic(plan, g);
    out.push({ name: c.name, grounding: g, plan, audit, humanScore: null });
  }
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`\nwrote ${out.length} plans to ${file}`);
  console.log(`→ fill in each "humanScore" (1–5), then: npx tsx scripts/judge-validate.mts check ${file}`);
  if (out.length < JUDGE_TRUST.minN)
    console.log(`NOTE: only ${out.length} plans; the gate needs n ≥ ${JUDGE_TRUST.minN}. Add more rated plans (P1 cases or real usage) before it can pass.`);
}

async function check() {
  requireKey();
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as (LabeledPlan & { name?: string })[];
  const labeled = raw.filter((l) => typeof l.humanScore === "number");
  const skipped = raw.length - labeled.length;
  if (skipped) console.log(`skipping ${skipped} unrated entr${skipped === 1 ? "y" : "ies"}`);
  if (labeled.length === 0) {
    console.error("no rated plans — fill in humanScore first.");
    process.exit(2);
  }

  console.log(`judging ${labeled.length} plans with ${kickoffModel()} …`);
  const report = await validateJudge(labeled);
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  console.log(`\nn=${report.n}  MAE=${report.mae.toFixed(2)}  within-1=${pct(report.withinOne)}  r=${report.correlation?.toFixed(2) ?? "n/a"}`);
  console.log(`pairs (human/judge): ${report.pairs.map((p) => `${p.human}/${p.judge}`).join("  ")}`);
  console.log(`thresholds: n≥${JUDGE_TRUST.minN}  MAE≤${JUDGE_TRUST.maxMae}  within-1≥${pct(JUDGE_TRUST.minWithinOne)}  r≥${JUDGE_TRUST.minCorrelation}`);
  console.log(`\n=> judge ${report.trusted ? "TRUSTED ✓" : "NOT trusted ✗"}`);
  process.exit(report.trusted ? 0 : 1);
}

if (mode === "emit") emit();
else if (mode === "check") check();
else {
  console.error("usage: npx tsx scripts/judge-validate.mts <emit|check> [file.json]");
  process.exit(2);
}
