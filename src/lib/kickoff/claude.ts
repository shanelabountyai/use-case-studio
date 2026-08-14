/* Build Kickoff — the Claude-backed LLM stages (BK-3 planner, BK-4 critic).

   Drop-in implementations of the Planner/Critic types from provider.ts. Nothing
   upstream changes: executeJob (worker.ts) injects these instead of the stubs
   once the feature is enabled and a key is present (see provider.getProvider).

   Structured output is enforced against the SAME Zod contracts the rest of the
   pipeline uses (contracts.ts) — the model is asked for the JSON-schema shape,
   and the response is re-validated with IntegratedPlan.parse / CriticAudit.parse
   so the superRefine rules (REFINE gate, verdict echo) hold. One retry on a
   schema miss, feeding the error back; a second miss throws → the worker marks
   the lane failed → partial (never a silent "complete" over a bad plan). */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod/v4"; // same major as contracts.ts — see its import note
import { IntegratedPlan, CriticAudit, type GroundingInput } from "./contracts";
import type { Planner, Critic } from "./provider";
import { kickoffModel } from "./pricing";

const PLANNER_MAX_TOKENS = 20_000;
const CRITIC_MAX_TOKENS = 8_000;

/** The effort both stages run at. Exported because provenance records it — a
 *  second hardcoded copy would drift and re-introduce the lying-provenance bug
 *  this was extracted to fix. */
export const KICKOFF_EFFORT = "medium" as const;

function timeoutMs(): number {
  const n = Number(process.env.KICKOFF_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 280_000; // matches getLimits() default; fits 300s maxDuration
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  // Lazy so importing this module never throws when the key is absent (the stub
  // path must load fine in dev/CI). getProvider only routes here when set.
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

/** One structured call: ask for `schema`, re-validate the reply with `schema`,
 *  retry once on a validation miss. Returns the parsed value + token usage.
 *  Exported for the BK-7 LLM-judge (judge.ts), which reuses the same contract. */
export async function callStructured<T>(
  schema: Parameters<typeof zodOutputFormat>[0] & { parse: (raw: unknown) => T },
  system: string,
  user: string,
  maxTokens: number,
): Promise<{ data: T; inputTokens: number; outputTokens: number }> {
  const format = zodOutputFormat(schema);
  let inputTokens = 0;
  let outputTokens = 0;
  let lastErr = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];
    if (attempt > 0)
      messages.push({
        role: "user",
        content: `Your previous reply failed schema validation: ${lastErr}\nReturn corrected JSON that satisfies the schema exactly.`,
      });

    const res = await client().messages.create(
      {
        model: kickoffModel(),
        max_tokens: maxTokens,
        system,
        messages,
        output_config: { effort: KICKOFF_EFFORT, format },
      },
      { signal: AbortSignal.timeout(timeoutMs()) },
    );

    inputTokens += res.usage.input_tokens;
    outputTokens += res.usage.output_tokens;

    if (res.stop_reason === "refusal") throw new Error("model refused the request");
    if (res.stop_reason === "max_tokens") {
      lastErr = "response was truncated (hit max_tokens)";
      continue;
    }

    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    if (!text) {
      lastErr = "no text block in response";
      continue;
    }

    try {
      const data = schema.parse(JSON.parse(text)) as T;
      return { data, inputTokens, outputTokens };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`structured output invalid after retry: ${lastErr}`);
}

/* ─────────────────────────── Planner (BK-3) ─────────────────────────── */

const PLANNER_SYSTEM = `You are a senior AI delivery architect writing a build kickoff plan for an already-evaluated use case. You EXPAND the engine's grounding into an implementable plan — you never re-score or re-decide it.

Hard rules (violating any produces an unusable plan):
- verdict: echo GroundingInput.verdict EXACTLY. Never upgrade PARK/REFINE to BUILD.
- architecturePattern: echo GroundingInput.recommendation.architecturePattern verbatim; the plan expands it, it does not replace it.
- taskShape: echo GroundingInput.taskShape.
- The acceptanceBar is the spine — every milestone's exitCriterion must ladder toward it.
- No fabricated numbers or guarantees. Do NOT invent latency/accuracy/cost/SLA figures, and do NOT promise "zero errors", "guaranteed", "prevents all X". Any estimate (durations, throughput) must be explicitly labeled as an estimate and also listed in assumptions[].
- Do NOT name a specific vendor/product as mandatory. Describe capabilities ("a managed vector store"), not requirements ("you must use Pinecone").
- If verdict === "REFINE": refineGate is REQUIRED with ≥1 condition and ≥1 noGoCondition (when to stop). If verdict !== "REFINE": refineGate MUST be null.
- Every section's markdown must be substantive and specific to THIS case (architecture, dataPipeline, evaluation, governance, delivery; integrationNotes optional).

Return only JSON matching the schema.`;

export const realPlanner: Planner = async (g: GroundingInput) => {
  const { data, inputTokens, outputTokens } = await callStructured(
    IntegratedPlan,
    PLANNER_SYSTEM,
    `Write the build kickoff plan for this grounded case. Grounding (authoritative — echo verdict/taskShape/architecturePattern from it):\n\n${JSON.stringify(g, null, 2)}`,
    PLANNER_MAX_TOKENS,
  );
  return { plan: data, inputTokens, outputTokens };
};

/* ─────────────────────────── Critic (BK-4) ──────────────────────────── */

const CRITIC_SYSTEM = `You are an adversarial reviewer auditing a build kickoff plan for honesty and integrity. You see only the plan and the grounding it was built from. Your job is to catch problems, not to praise.

Audit for:
- fabricationScan: quote each fabricated or unlabeled claim. verdict "must-remove" for invented guarantees ("zero errors", "guaranteed"), vendor-as-requirement ("must use Pinecone"), or numbers with no basis; "must-label" for estimates presented as fact that should be marked as estimates; "ok" only if you must cite a borderline quote that is actually fine. An empty array means you found nothing — only use it if the plan is genuinely clean.
- consistencyIssues: internal contradictions (a milestone that ignores the acceptance bar, a data flow the architecture never mentions). [] if none.
- verdictIntegrity: does the plan's verdict match the grounding verdict and avoid quietly arguing for a rosier one? pass=false with a note if it drifts.
- gaps: at least ONE concrete gap the plan should address before build (missing eval strategy, unhandled failure mode, absent rollback). Always find at least one.
- overclaims: statements that promise more than the design supports. [] if none.
- verdict: report your honest judgment, but note it is RECOMPUTED from the findings above — inflating or softening it changes nothing. Spend your effort on the findings being right.
- acceptanceBarSpine: judge the bar AS WRITTEN in the grounding. If it states no measurable threshold, isSpine is false — a plan that promises to define the bar later is not a plan built on one.
- topFixes: the ≤3 highest-leverage corrections, most important first.

Be specific and quote the plan. Return only JSON matching the schema.`;

/* The model's own verdict field was measured to be constant: eight runs — six
   well-specified cases, one deliberately incoherent one — all returned SHIP
   WITH FIXES. The rubric made it the only reachable value (gaps are required to
   be non-empty, so SHIP AS-IS never applies; NEEDS REWORK needed a must-remove
   fabrication that rarely fires). A verdict that never varies carries no
   information, so it is derived here from the findings the critic reports
   rather than chosen by it. The findings themselves were accurate — it is only
   the summary judgment that was stuck. */
export function deriveVerdict(a: Omit<CriticAudit, "verdict">): CriticAudit["verdict"] {
  const mustRemove = a.fabricationScan.some((f) => f.verdict === "must-remove");
  if (mustRemove || !a.verdictIntegrity.pass || !a.acceptanceBarSpine.isSpine) return "NEEDS REWORK";

  const mustLabel = a.fabricationScan.some((f) => f.verdict === "must-label");
  const clean = !mustLabel && a.overclaims.length === 0 && a.consistencyIssues.length === 0;
  // Gaps alone don't block: the schema requires at least one, so treating any
  // gap as a defect would pin this to SHIP WITH FIXES the same way.
  return clean ? "SHIP AS-IS" : "SHIP WITH FIXES";
}

export const realCritic: Critic = async (plan, g: GroundingInput) => {
  const { data, inputTokens, outputTokens } = await callStructured(
    CriticAudit,
    CRITIC_SYSTEM,
    `Audit this plan.\n\nGROUNDING (source of truth):\n${JSON.stringify(g, null, 2)}\n\nPLAN TO AUDIT:\n${JSON.stringify(plan, null, 2)}`,
    CRITIC_MAX_TOKENS,
  );
  return { audit: { ...data, verdict: deriveVerdict(data) }, inputTokens, outputTokens };
};
