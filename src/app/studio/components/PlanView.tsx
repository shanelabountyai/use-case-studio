"use client";

import type { IntegratedPlan, CriticAudit } from "@/lib/kickoff/contracts";
import { C, MONO } from "../theme";
import { Eyebrow } from "./atoms";

/* Renders a generated build plan on screen. Until this existed a completed run
   produced a Markdown download and nothing readable in the app.

   Deliberately not a Markdown renderer: section bodies are short prose, so
   paragraph splitting on blank lines covers them without pulling in a parser.
   ponytail: if the planner starts emitting tables or nested lists, swap this
   for a real Markdown component rather than growing the regex. */

const SECTION_ORDER: [keyof IntegratedPlan["sections"], string][] = [
  ["architecture", "Architecture"],
  ["dataPipeline", "Data pipeline"],
  ["evaluation", "Evaluation"],
  ["governance", "Governance"],
  ["delivery", "Delivery"],
  ["integrationNotes", "Integration notes"],
];

const AUDIT_COLOR: Record<CriticAudit["verdict"], string> = {
  "SHIP AS-IS": C.green,
  "SHIP WITH FIXES": C.amber,
  "NEEDS REWORK": C.red,
};

/* Bold spans and bullet lines are the only markup the planner reliably emits;
   everything else renders as plain paragraphs. */
function Prose({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed" style={{ color: C.ink }}>
      {text.split(/\n{2,}/).map((para, i) => {
        const lines = para.split("\n");
        const bullets = lines.every((l) => /^\s*[-*]\s+/.test(l));
        if (bullets)
          return (
            <ul key={i} className="list-disc pl-5 mb-3">
              {lines.map((l, j) => <li key={j} className="mb-1">{inline(l.replace(/^\s*[-*]\s+/, ""))}</li>)}
            </ul>
          );
        return <p key={i} className="mb-3">{inline(para)}</p>;
      })}
    </div>
  );
}

const inline = (s: string) =>
  s.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) => {
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`")) return <code key={i} style={{ fontFamily: MONO, fontSize: 12, background: C.paper, padding: "1px 4px" }}>{part.slice(1, -1)}</code>;
    return <span key={i}>{part}</span>;
  });

export function PlanView({ plan, audit }: { plan: IntegratedPlan; audit: CriticAudit | null }) {
  return (
    <div className="mt-5" style={{ borderTop: `1px solid ${C.line}`, paddingTop: 20 }}>
      <Eyebrow>Executive summary</Eyebrow>
      <p className="text-sm leading-relaxed mb-2" style={{ color: C.ink }}>{plan.executiveSummary}</p>
      <p className="text-xs mb-5" style={{ fontFamily: MONO, color: C.inkSoft }}>
        {plan.architecturePattern} · task shape {plan.taskShape} · verdict {plan.verdict}
      </p>

      {/* The critic's own verdict leads — a plan is only as trustworthy as its audit. */}
      {audit && (
        <div className="p-4 mb-5" style={{ background: C.surface, border: `1px solid ${AUDIT_COLOR[audit.verdict]}` }}>
          <div className="uppercase mb-2" style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", color: AUDIT_COLOR[audit.verdict] }}>
            Critic audit — {audit.verdict}
          </div>
          {audit.topFixes.length > 0 && (
            <ol className="list-decimal pl-5 text-sm mb-2" style={{ color: C.ink }}>
              {audit.topFixes.map((f, i) => <li key={i} className="mb-1">{f}</li>)}
            </ol>
          )}
          <div className="text-xs" style={{ fontFamily: MONO, color: C.inkSoft }}>
            {audit.gaps.length} gap{audit.gaps.length === 1 ? "" : "s"} ·{" "}
            {audit.overclaims.length} overclaim{audit.overclaims.length === 1 ? "" : "s"} ·{" "}
            {audit.fabricationScan.length} claim{audit.fabricationScan.length === 1 ? "" : "s"} scanned ·
            acceptance bar {audit.acceptanceBarSpine.isSpine ? "is" : "is NOT"} the spine ·
            verdict integrity {audit.verdictIntegrity.pass ? "pass" : "FAIL"}
          </div>
        </div>
      )}

      {SECTION_ORDER.map(([key, label]) => {
        const section = plan.sections[key];
        if (!section) return null;
        return (
          <details key={key} className="mb-2" style={{ border: `1px solid ${C.line}`, background: C.surface }}>
            <summary className="p-3 cursor-pointer" style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.04em", color: C.ink }}>
              {label.toUpperCase()} — {section.heading}
            </summary>
            <div className="px-4 pb-4"><Prose text={section.markdown} /></div>
          </details>
        );
      })}

      <div className="grid sm:grid-cols-2 gap-5 mt-5">
        <div>
          <Eyebrow>Milestones</Eyebrow>
          <ol className="list-decimal pl-5 text-sm" style={{ color: C.ink }}>
            {plan.milestones.map((m, i) => (
              <li key={i} className="mb-2">
                <strong>{m.phase}</strong> — {m.goal}
                <span className="block text-xs mt-0.5" style={{ color: C.inkSoft }}>Exit: {m.exitCriterion}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <Eyebrow>Assumptions</Eyebrow>
          <ul className="list-disc pl-5 text-sm" style={{ color: C.ink }}>
            {plan.assumptions.map((a, i) => <li key={i} className="mb-1">{a}</li>)}
          </ul>
        </div>
      </div>

      {audit && audit.gaps.length > 0 && (
        <div className="mt-5">
          <Eyebrow>Gaps the critic found</Eyebrow>
          <ul className="text-sm" style={{ color: C.ink }}>
            {audit.gaps.map((g, i) => (
              <li key={i} className="mb-2">
                <strong>{g.title}</strong>
                <span className="block" style={{ color: C.inkSoft }}>{g.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
