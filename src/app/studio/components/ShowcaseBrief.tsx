"use client";

import type { ArchRec, Evaluation, UseCase } from "@/lib/engine";
import { C, MONO, SANS, btn } from "../theme";
import { Eyebrow, Flag } from "./atoms";
import { Matrix } from "./Matrix";
import { VerdictCard } from "./panels";

/* Client-ready one-page brief with its print stylesheet, ported from the
   reference. Rendered as the studio's "showcase" mode; M3 reuses it for
   the public /s/[token] share page. */
export function ShowcaseBrief({ uc, ev, arch, onBack }: {
  uc: UseCase;
  ev: Evaluation;
  arch: ArchRec;
  onBack?: () => void;
}) {
  return (
    <div style={{ background: C.paper, minHeight: "100vh", fontFamily: SANS, color: C.ink }} className="px-4 py-8 sm:px-8">
      <style>{`@media print { .no-print{display:none !important;} @page{margin:14mm;} html,body{background:#fff !important;} *{-webkit-print-color-adjust:exact;print-color-adjust:exact;} }`}</style>
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-start mb-8 flex-wrap gap-3">
          <div>
            <Eyebrow>AI use-case brief</Eyebrow>
            <h1 style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.15 }}>{uc.name || "Untitled use case"}</h1>
          </div>
          <div className="flex gap-2 no-print">
            <button onClick={() => window.print()} style={btn(C.blue, "#fff")}>SAVE AS PDF</button>
            {onBack && <button onClick={onBack} style={btn("transparent", C.ink, `1px solid ${C.ink}`)}>PRACTITIONER VIEW</button>}
          </div>
        </div>
        <p className="no-print text-xs mb-5" style={{ color: C.inkSoft, fontFamily: MONO }}>SAVE AS PDF opens your browser&apos;s print dialog → choose &ldquo;Save as PDF.&rdquo;</p>
        <VerdictCard ev={ev} />
        {ev.flags.filter((f) => f.sev === "critical").map((f, i) => <Flag key={i} sev="critical">{f.text}</Flag>)}
        <div className="grid sm:grid-cols-2 gap-6 my-6 items-start">
          <div><Eyebrow>Where it sits</Eyebrow><Matrix impact={ev.impact} effort={ev.effort} quadrant={ev.quadrant} name={uc.name} /></div>
          <div>
            <Eyebrow>The problem</Eyebrow>
            <p className="text-sm leading-relaxed mb-4">{uc.problem || "Not yet described."}</p>
            <Eyebrow>What success looks like</Eyebrow>
            <p className="text-sm leading-relaxed">{uc.outcome || "Not yet described."} {uc.acceptanceBar && <span>Measured as: {uc.acceptanceBar}</span>}</p>
          </div>
        </div>
        <Eyebrow>The recommended approach, in plain terms</Eyebrow>
        <p className="text-sm leading-relaxed mb-3"><strong>{arch.pattern}.</strong> {arch.why}</p>
        <p className="text-sm leading-relaxed mb-3">{arch.hitl}</p>
        <p className="text-sm leading-relaxed mb-6">Before anyone trusts it, it gets tested the boring way: a scored test set, adversarial probing of the specific risks this case carries, and a staged release where humans stay in control until the numbers earn otherwise. Every claim here traces to the inputs on the practitioner side — nothing is a projected ROI figure or an industry statistic.</p>
        <Eyebrow>First three actions</Eyebrow>
        <ol className="text-sm leading-relaxed list-decimal ml-5 mb-10">
          <li className="mb-1">{uc.acceptanceBar ? `Confirm the acceptance bar with the owner: ${uc.acceptanceBar}` : "Define a measurable acceptance bar — nothing else is testable without it."}</li>
          <li className="mb-1">{uc.dataSources ? `Verify hands-on access to the stated data (${uc.dataSources}) and inspect a real sample.` : "Identify and verify access to the data this depends on."}</li>
          <li>Build the thinnest testable version of the {arch.pattern.toLowerCase()} and score it against the bar.</li>
        </ol>
        <div className="pt-4 text-xs flex justify-between flex-wrap gap-2" style={{ borderTop: `1px solid ${C.line}`, color: C.inkSoft, fontFamily: MONO }}>
          <span>Heuristic instrument — outputs are defensible starting points, not guarantees.</span>
          <span>Frameworks: CRISP-DM · NIST AI RMF 1.0 · TRL/DRL · Impact×Effort — vendor-neutral throughout.</span>
        </div>
      </div>
    </div>
  );
}
