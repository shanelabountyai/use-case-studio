import { randomBytes } from "node:crypto";
import { blankCase, type Evaluation, type UseCase } from "./engine";

/* Share-link tokens (FABLE-BRIEF M3): unguessable, URL-safe, revocable.
   24 random bytes = 192 bits of entropy, base64url-encoded to 32 chars
   (no padding, only [A-Za-z0-9_-]) — comfortably past the 24-char floor. */
export function generateShareToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Build the public share URL for a token, given the request origin. */
export function shareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/s/${token}`;
}

/* --------------------- public brief projection --------------------- */

export interface PublicBrief { uc: UseCase; ev: Evaluation; }

/** Redact a use case + evaluation down to exactly what the public
 *  /s/[token] brief renders, at the trust boundary.
 *
 *  Props passed to a client component are serialized into the page, so
 *  anything on `uc`/`ev` reaches the browser whether or not it is drawn.
 *  The raw payload carries practitioner-confidential inputs the brief never
 *  shows — current cost, budget, compliance notes, data sensitivity, and the
 *  raw per-dimension scores/weights inside `ev.contribs` that drive the
 *  verdict. Those must be stripped here, not merely hidden in the UI.
 *
 *  Built on blankCase() so any field later added to UseCase stays redacted
 *  by default — a new field is exposed only if it is opted in here. */
export function toPublicBrief(uc: UseCase, ev: Evaluation): PublicBrief {
  const safeUc: UseCase = {
    ...blankCase(),
    name: uc.name,
    problem: uc.problem,
    outcome: uc.outcome,
    acceptanceBar: uc.acceptanceBar,
    dataSources: uc.dataSources,
  };
  // contribs holds each dimension's raw score + weight — internal calibration.
  // The brief shows only the composite/verdict/matrix, so drop the breakdown.
  const safeEv: Evaluation = { ...ev, contribs: [] };
  return { uc: safeUc, ev: safeEv };
}
