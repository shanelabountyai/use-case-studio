"use client";

import { CRISP, type ArchRec, type DataRec, type Evaluation, type TestRec, type UseCase } from "@/lib/engine";
import { C, MONO, btn } from "../theme";
import { Eyebrow, Flag, PanelShell } from "./atoms";
import { VerdictCard } from "./panels";

export function RecommendStage({ uc, ev, arch, data, test, currentId, onSave, onNext }: {
  uc: UseCase;
  ev: Evaluation;
  arch: ArchRec;
  data: DataRec;
  test: TestRec;
  currentId: string | null;
  onSave: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <VerdictCard ev={ev} currentId={currentId} onSave={onSave} />
      <PanelShell n="03·A" title="Architecture">
        {arch.flag && <Flag sev="warn">{arch.flag}</Flag>}
        <p className="text-sm mb-2"><span style={{ fontFamily: MONO, fontSize: 11, color: C.blue }} className="uppercase mr-2">Pattern</span><strong>{arch.pattern}</strong></p>
        <p className="text-sm leading-relaxed mb-3">{arch.why}</p>
        {arch.runnerUp && <p className="text-sm leading-relaxed mb-3" style={{ color: C.inkSoft }}>{arch.runnerUp}</p>}
        <p className="text-sm leading-relaxed p-3" style={{ background: C.blueSoft }}>{arch.hitl}</p>
      </PanelShell>
      <PanelShell n="03·B" title="Workflow — CRISP-DM, made concrete">
        <p className="text-xs mb-3" style={{ color: C.inkSoft }}>Six CRISP-DM phases translated into next actions for this case. Phases iterate; this is a loop, not a waterfall.</p>
        {CRISP.map(([phase, fn], i) => (
          <div key={phase} className="mb-3">
            <div className="flex items-baseline gap-2"><span style={{ fontFamily: MONO, fontSize: 10, color: C.blue }}>P{i + 1}</span><span className="text-sm font-semibold">{phase}</span></div>
            <ul className="ml-6 mt-1">{fn(uc).map((a, j) => <li key={j} className="text-sm leading-relaxed list-disc mb-1">{a}</li>)}</ul>
          </div>
        ))}
      </PanelShell>
      <PanelShell n="03·C" title="Data access & governance">
        {data.flag && <Flag sev="warn">{data.flag}</Flag>}
        {data.gap && <Flag sev="warn">{data.gap}</Flag>}
        <ul className="ml-5 mb-3">{data.items.map((t, i) => <li key={i} className="text-sm leading-relaxed list-disc mb-2">{t}</li>)}</ul>
        <Eyebrow>Governance layer</Eyebrow>
        <ul className="ml-5">{data.gov.map((t, i) => <li key={i} className="text-sm leading-relaxed list-disc mb-2">{t}</li>)}</ul>
      </PanelShell>
      <PanelShell n="03·D" title="Testing — layered, tied to the acceptance bar">
        {test.flag && <Flag sev="warn">{test.flag}</Flag>}
        {test.layers.map((l, i) => (
          <div key={i} className="mb-3">
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.blue }} className="uppercase">{`T${i + 1} · ${l.name}`}</span>
            <p className="text-sm leading-relaxed mt-1">{l.body}</p>
          </div>
        ))}
      </PanelShell>
      <div className="flex justify-end"><button onClick={onNext} style={btn(C.blue, "#fff")}>EXPORT →</button></div>
    </div>
  );
}
