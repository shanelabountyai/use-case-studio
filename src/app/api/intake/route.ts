import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { useCases, users } from "@/db/schema";
import { evaluate } from "@/lib/engine";
import { parseUseCase } from "@/lib/validation";
import { intakeToPayload, isBotSubmission, hasMinimumContent, type IntakeAnswers } from "@/lib/intake";

export const runtime = "nodejs"; // Neon HTTP driver + FormData parsing

/* Public, UNAUTHENTICATED write endpoint for the hosted discovery form
   (public/discovery.html). It creates a Capture-stage draft use case owned by
   the configured practitioner, so submissions land in their Library ready to
   score — replacing the old email-only round-trip.

   Because it is public, it is defended in layers:
     - honeypot (botcheck) + a required problem statement drop empty/bot noise,
     - an optional shared INTAKE_KEY gates who may submit (the discovery link
       is the capability — same model the form's old web3forms key used),
     - per-field length caps (in intake.ts) and a per-instance rate limit bound
       resource abuse,
     - the owner is resolved server-side from INTAKE_OWNER_EMAIL — the client
       never chooses whose Library it writes to. */

const WINDOW_MS = 60_000;
const MAX_HITS = 20; // submissions per IP per window
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 10_000) hits.clear();
  const rec = hits.get(ip);
  if (!rec || now > rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  rec.count++;
  return rec.count > MAX_HITS;
}

function formToAnswers(fd: FormData): IntakeAnswers {
  const out: IntakeAnswers = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === "string") out[k] = v; // ignore any File parts
  }
  return out;
}

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  // Accept both multipart/form-data (the form's default) and JSON.
  let answers: IntakeAnswers;
  const ctype = req.headers.get("content-type") ?? "";
  try {
    if (ctype.includes("application/json")) {
      answers = (await req.json()) as IntakeAnswers;
    } else {
      answers = formToAnswers(await req.formData());
    }
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  // Honeypot: silently accept so a bot gets no signal, but persist nothing.
  if (isBotSubmission(answers)) return NextResponse.json({ ok: true });

  if (!hasMinimumContent(answers)) {
    return NextResponse.json({ ok: false, error: "missing_problem" }, { status: 422 });
  }

  // Optional shared-secret gate. Only enforced when INTAKE_KEY is configured.
  const requiredKey = process.env.INTAKE_KEY;
  if (requiredKey && answers["key"] !== requiredKey) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  // Resolve the owning practitioner server-side. Never client-supplied.
  const ownerEmail = process.env.INTAKE_OWNER_EMAIL;
  if (!ownerEmail) {
    return NextResponse.json({ ok: false, error: "intake_not_configured" }, { status: 503 });
  }
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.email, ownerEmail)).limit(1);
  if (!owner) {
    return NextResponse.json({ ok: false, error: "owner_not_found" }, { status: 503 });
  }

  const draft = intakeToPayload(answers);
  const parsed = parseUseCase(draft); // clamp/normalize; keeps source+intake via passthrough
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: "invalid_payload", issues: parsed.issues }, { status: 400 });
  }
  const payload = parsed.data;
  const ev = evaluate(payload); // scores are blankCase defaults → a provisional verdict until the practitioner scores it

  await db.insert(useCases).values({
    userId: owner.id,
    name: payload.name ?? "",
    verdict: ev.verdict,
    composite: Math.round(ev.composite),
    quadrant: ev.quadrant,
    payload,
  });

  return NextResponse.json({ ok: true });
}
