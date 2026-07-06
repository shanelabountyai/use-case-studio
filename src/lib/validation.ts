import { z } from "zod";
import type { UseCase } from "./engine";

/* Server-side validation for the UseCase payload (FABLE-BRIEF M3).
   Rules:
   - REJECT structural garbage — wrong types or a missing scores/weights/
     thresholds object fail with a 400; nothing is coerced from junk.
   - CLAMP, don't reject, out-of-range numerics — scores to 0–5, weights to
     ≥ 0, thresholds to 0–100 — so a slightly-off slider value is corrected
     rather than blocking a save.
   - PASS THROUGH unknown top-level keys (`.passthrough()`) so the engine's
     "ignores unknown fields" contract holds and DK-1's engagement inputs can
     ride along on the same jsonb payload without a schema change here. */

const finite = z.number().refine(Number.isFinite, "must be a finite number");
const scoreVal = finite.transform((n) => Math.max(0, Math.min(5, n)));
const weightVal = finite.transform((n) => Math.max(0, n));
const thresholdVal = finite.transform((n) => Math.max(0, Math.min(100, n)));
// Missing string fields default to "" (a normalization, not coercion); a
// present-but-non-string field still fails, since z.string() never coerces.
const str = z.string().default("");

const dimKeys = ["value", "feasibility", "dataReadiness", "risk", "cost", "timeToValue", "fit"] as const;
const scoresSchema = z.object(Object.fromEntries(dimKeys.map((k) => [k, scoreVal])) as Record<(typeof dimKeys)[number], typeof scoreVal>);
const weightsSchema = z.object(Object.fromEntries(dimKeys.map((k) => [k, weightVal])) as Record<(typeof dimKeys)[number], typeof weightVal>);
const thresholdsSchema = z.object({ build: thresholdVal, refine: thresholdVal });

export const useCaseSchema = z
  .object({
    name: str, problem: str, currentCost: str, users: str, outcome: str, acceptanceBar: str,
    dataSources: str, dataFormat: str, dataVolume: str, dataSensitivity: str, dataFreshness: str,
    latency: str, budget: str, compliance: str, oversight: str, taskVolume: str, taskShape: str,
    scores: scoresSchema,
    weights: weightsSchema,
    thresholds: thresholdsSchema,
  })
  .passthrough();

export type ParseResult =
  | { ok: true; data: UseCase }
  | { ok: false; issues: string[] };

/** Validate an untrusted payload into a UseCase, or report why it was rejected. */
export function parseUseCase(input: unknown): ParseResult {
  const r = useCaseSchema.safeParse(input);
  if (!r.success) {
    return { ok: false, issues: r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
  }
  return { ok: true, data: r.data as unknown as UseCase };
}
