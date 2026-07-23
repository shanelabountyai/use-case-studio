/* =============================================================
   Intake notification (best-effort, never load-bearing).

   When the public discovery form was rewired from web3forms email to the
   /api/intake DB write, submissions stopped emailing the practitioner — new
   intakes landed silently in the Library. This module restores awareness:
   after a successful insert, the API route sends a short "new intake" email
   to INTAKE_OWNER_EMAIL via Resend's HTTP API.

   Design constraints, in order:
   - BEST-EFFORT ONLY. The intake is already persisted before this runs; a
     notification failure must never fail the submission. Every path returns
     a boolean — nothing here throws.
   - No new dependency. Auth.js's Resend provider already talks to Resend's
     HTTP API with AUTH_RESEND_KEY; we do the same with plain fetch, and use
     the same verified test sender (onboarding@resend.dev). That sender only
     delivers to the practitioner's own inbox — which is exactly the sole
     recipient here (INTAKE_OWNER_EMAIL), so the v1 limitation is a fit,
     not a compromise.
   - Pure where possible: the email body builder is a pure function the tests
     assert on; the sender takes an injectable fetch for testing.
   ============================================================= */

import type { IntakePayload } from "./intake";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FROM = "onboarding@resend.dev"; // same Resend-verified test sender as src/auth.ts
const SNIPPET_LEN = 300;

function snippet(v: string): string {
  const t = v.trim();
  return t.length > SNIPPET_LEN ? `${t.slice(0, SNIPPET_LEN)}…` : t;
}

/** Build the notification subject + plain-text body from an intake payload.
 *  Pure. Includes only what the practitioner needs to decide to open the
 *  Library: who submitted, from where, and the problem statement. */
export function intakeNotificationEmail(p: IntakePayload): { subject: string; text: string } {
  const company = p.intake.company || "unknown company";
  const who = [p.intake.submitterName, p.intake.submitterEmail].filter(Boolean).join(" · ");
  const lines = [
    `A new discovery intake arrived and was saved to your Library as "${p.name}".`,
    ``,
    `Company:   ${company}`,
    `Submitted: ${who || "(no submitter details)"}`,
    ``,
    `Problem:`,
    snippet(p.problem) || "(none given)",
    ``,
    `It is a Capture-stage draft with default scores — open the studio Library`,
    `(look for the FROM INTAKE badge), load it, and score it in Evaluate.`,
  ];
  return { subject: `New intake — ${company}`, text: lines.join("\n") };
}

/** Send the notification. Returns true only when Resend accepted the request.
 *  Missing key, HTTP error, or network failure all return false — callers
 *  treat that as "no notification", nothing more. */
export async function sendIntakeNotification(
  to: string,
  p: IntakePayload,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const key = process.env.AUTH_RESEND_KEY;
  if (!key || !to) return false;
  try {
    const { subject, text } = intakeNotificationEmail(p);
    const res = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
