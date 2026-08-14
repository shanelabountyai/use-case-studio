"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Evaluation } from "@/lib/engine";
import type { IntegratedPlan, CriticAudit } from "@/lib/kickoff/contracts";
import { C, MONO, btn } from "../theme";
import { Eyebrow, PanelShell } from "./atoms";
import { PlanView } from "./PlanView";

/* Build Kickoff trigger (interim UI). The pipeline shipped API-only — this is
   the smallest surface that reaches it: POST /api/kickoff, poll the job, then
   approve + export the Markdown through the existing endpoints. No plan
   renderer here; the Markdown export already binds the disclaimer + audit.
   ponytail: owner-only gating deferred — the API is already owner-scoped, so
   this only hides a button, not data. Gate on session email when the studio
   grows a real roles concept. */

type Job = {
  jobId: string;
  status: "queued" | "running" | "partial" | "complete" | "failed" | "approved";
  cost: { usd?: number } | null;
  note: string | null;
  plan: IntegratedPlan | null;
  audit: CriticAudit | null;
};

const LIVE = new Set(["queued", "running"]);

// The API answers with { error, reason?, missing? }; surface whichever it sent.
const errText = (status: number, body: { error?: string; reason?: string; missing?: string[] }) =>
  status === 503 ? "Build Kickoff is switched off (KICKOFF_ENABLED)."
  : status === 501 ? "Only BUILD cases can be kicked off — REFINE support isn't built yet."
  : body.missing?.length ? `Case is missing: ${body.missing.join(", ")}`
  : body.reason || body.error || `Request failed (${status})`;

export function KickoffPanel({ ev, currentId, onDownload, onCopy, safeFile, caseName }: {
  ev: Evaluation;
  currentId: string | null;
  onDownload: (filename: string, text: string, mime: string) => void;
  onCopy: (text: string, label: string) => void;
  safeFile: (n: string) => string;
  caseName: string;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const jobId = job?.jobId ?? null;
  const live = job ? LIVE.has(job.status) : false;

  // Poll only while the job is queued/running; the interval clears itself on a
  // terminal status or unmount.
  useEffect(() => {
    if (!jobId || !live) return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/kickoff/${jobId}`);
      if (res.ok) setJob(await res.json());
    }, 5000);
    return () => clearInterval(id);
  }, [jobId, live]);

  const start = useCallback(async (confirmSendToProvider = false) => {
    if (!currentId) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/kickoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: currentId, ...(confirmSendToProvider && { confirmSendToProvider: true }) }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 202) { setJob({ jobId: body.jobId, status: "queued", cost: null, note: null, plan: null, audit: null }); return; }
      // PARK returns 200 with a "what would move this to BUILD" note, not a job.
      if (res.ok && body.note) { setMsg(body.note); return; }
      if (res.status === 409 && body.needs === "confirmSendToProvider") {
        if (window.confirm(`${body.reason}\n\nSend it?`)) return start(true);
        return;
      }
      setMsg(errText(res.status, body));
    } finally { setBusy(false); }
  }, [currentId]);

  const approveAndExport = useCallback(async () => {
    if (!jobId) return;
    setBusy(true); setMsg(null);
    try {
      const ap = await fetch(`/api/kickoff/${jobId}/approve`, { method: "POST" });
      if (!ap.ok) { setMsg(errText(ap.status, await ap.json().catch(() => ({})))); return; }
      const ex = await fetch(`/api/kickoff/${jobId}/export.md`);
      if (!ex.ok) { setMsg(errText(ex.status, await ex.json().catch(() => ({})))); return; }
      onDownload(`${safeFile(caseName)}-build-plan.md`, await ex.text(), "text/markdown");
      setJob((j) => (j ? { ...j, status: "approved" } : j));
    } finally { setBusy(false); }
  }, [jobId, onDownload, safeFile, caseName]);

  const blocked =
    !currentId ? "Save this case to your library first — the plan is tied to a saved case."
    : ev.verdict !== "BUILD" ? `Verdict is ${ev.verdict}. Only BUILD cases generate a build plan.`
    : null;

  return (
    <PanelShell n="06·B" title="Build kickoff">
      <p className="text-sm leading-relaxed mb-4" style={{ color: C.inkSoft }}>
        Turns this case into an executable build plan — architecture, data pipeline, evaluation,
        governance, milestones — then a second AI critic audits it for fabricated benchmarks and
        vendor lock-in. Takes ~3 minutes and costs about $0.40 per plan.
      </p>

      {blocked ? (
        <p className="text-sm" style={{ color: C.amber, fontFamily: MONO }}>{blocked}</p>
      ) : (
        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={() => start()}
            disabled={busy || live}
            style={{ ...btn(C.blue, "#fff"), opacity: busy || live ? 0.5 : 1, cursor: busy || live ? "wait" : "pointer" }}
          >
            {live ? "GENERATING…" : job ? "REGENERATE BUILD PLAN" : "GENERATE BUILD PLAN"}
          </button>
          {(job?.status === "complete" || job?.status === "partial") && (
            <button onClick={approveAndExport} disabled={busy} style={btn(C.ink, C.paper)}>
              APPROVE &amp; DOWNLOAD PLAN
            </button>
          )}
        </div>
      )}

      {job && (
        <div className="mt-4 text-xs" style={{ fontFamily: MONO, color: C.inkSoft }} aria-live="polite">
          <div>
            <Eyebrow>Status</Eyebrow> {job.status}
            {job.status === "queued" && " — the worker picks it up within a minute"}
            {job.status === "partial" && " — some lanes failed; the plan is incomplete"}
            {typeof job.cost?.usd === "number" && ` · $${job.cost.usd.toFixed(2)}`}
          </div>
          {job.note && <div className="mt-1" style={{ color: C.amber }}>{job.note}</div>}
          {job.status === "approved" && <div className="mt-1">Downloaded. Regenerate for a fresh plan.</div>}
        </div>
      )}

      {/* A partial keeps its plan (the critic lane failed), so render whatever
          the run produced rather than hiding it behind the download. */}
      {job?.plan && <PlanView plan={job.plan} audit={job.audit} />}

      {msg && (
        <div className="mt-4 p-3 text-sm" style={{ background: C.amberSoft, border: `1px solid ${C.amber}`, color: C.ink }} role="alert">
          {msg}
          <button onClick={() => onCopy(msg, "Message")} className="ml-2 underline" style={{ fontFamily: MONO, fontSize: 11 }}>copy</button>
        </div>
      )}
    </PanelShell>
  );
}
