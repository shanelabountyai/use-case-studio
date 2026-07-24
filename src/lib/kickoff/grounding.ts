/* =============================================================
   Build Kickoff — grounding serializer (BK-2).

   Pure, deterministic. Selects exactly which engine outputs enter Call 1's
   prompt and in what shape — so a silent change here is a silent change to
   what the planner is grounded on, which is why it's golden-tested.

   Also hosts the PARK-note generator (a sibling pure function used by BK-1 for
   the PARK verdict path — no LLM, no spend).
   ============================================================= */

import { createHash } from "node:crypto";
import {
  evaluate,
  recArchitecture,
  recDataAccess,
  recTesting,
  CRISP,
  DIMS,
  type UseCase,
} from "../engine";
import { GroundingInput, TaskShape } from "./contracts";

// ponytail: naive per-field char cap on the embedded free-text copy to bound
// prompt size; raise if a case legitimately needs more. The pulled-out
// acceptanceBar (the spine) is deliberately NOT capped.
const TEXT_CEILING = 4000;

/** Canonical JSON with sorted keys — stable across jsonb round-trips so the
 *  content hash is reproducible. */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}

/** Content hash of the case payload at generation time (GroundingInput.caseVersion
 *  and provenance.engineOutputsHash both derive from the case). */
export function caseVersionHash(uc: UseCase): string {
  return `sha256:${createHash("sha256").update(stableStringify(uc)).digest("hex").slice(0, 16)}`;
}

function capFreeText(uc: UseCase): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(uc)) {
    out[k] =
      typeof val === "string" && val.length > TEXT_CEILING
        ? `${val.slice(0, TEXT_CEILING)}…⟪truncated⟫`
        : val;
  }
  return out;
}

const isTaskShape = (s: string): s is (typeof TaskShape.options)[number] =>
  (TaskShape.options as readonly string[]).includes(s);

/** Map engine outputs → GroundingInput. Derives evaluation + recommendations
 *  from the pure engine internally so there's one source of truth and no way to
 *  pass a mismatched evaluation. Validates on the way out. */
export function serializeGrounding(caseId: string, uc: UseCase): GroundingInput {
  const ev = evaluate(uc);
  const arch = recArchitecture(uc);
  const data = recDataAccess(uc);
  const test = recTesting(uc);

  const g: GroundingInput = {
    caseId,
    caseVersion: caseVersionHash(uc),
    name: uc.name,
    verdict: ev.verdict,
    composite: ev.composite,
    quadrant: ev.quadrant,
    taskShape: isTaskShape(uc.taskShape) ? uc.taskShape : "",
    acceptanceBar: uc.acceptanceBar,
    useCase: capFreeText(uc),
    evaluation: {
      flags: ev.flags.map((f) => ({ sev: f.sev, text: f.text })),
      contribs: ev.contribs.map((c) => ({
        key: c.key,
        label: c.label,
        score: c.score,
        weight: c.weight,
      })),
    },
    recommendation: {
      architecturePattern: arch.pattern, // pinned; the planner expands, never re-patterns
      architectureWhy: arch.why,
      hitl: arch.hitl,
      dataAccess: data.items,
      testingLayers: test.layers.map((l) => ({ name: l.name, body: l.body })),
      crisp: CRISP.map(([phase, fn]) => ({ phase, actions: fn(uc) })),
    },
  };
  return GroundingInput.parse(g);
}

const DIM_HELP = Object.fromEntries(DIMS.map((d) => [d.key, d.help])) as Record<string, string>;

/** PARK path (BK-1): a short, deterministic "what would move this to BUILD"
 *  note from the two weakest dimensions + any critical flags. No LLM, no spend. */
export function parkNote(uc: UseCase): string {
  const ev = evaluate(uc);
  const weakest = [...ev.contribs].sort((a, b) => a.score - b.score).slice(0, 2);
  const lines = [
    `This case scored ${ev.composite.toFixed(0)}/100 — ${ev.verdict}. It was parked, not built. To move it toward BUILD, the weakest dimensions have to lift:`,
    "",
    ...weakest.map((c) => `- ${c.label} (${c.score}/5): ${DIM_HELP[c.key] ?? "strengthen with concrete evidence."}`),
  ];
  const criticals = ev.flags.filter((f) => f.sev === "critical");
  if (criticals.length) {
    lines.push("", "Blocking flags to resolve first:");
    criticals.forEach((f) => lines.push(`- ${f.text}`));
  }
  lines.push("", "Re-score in Evaluate once these change; no plan is generated while the case is parked.");
  return lines.join("\n");
}
