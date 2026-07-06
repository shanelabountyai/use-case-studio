"use client";

import { DIMS, normalizedWeights, type DimKey, type Evaluation, type UseCase } from "@/lib/engine";
import { C, MONO, btn, inputStyle } from "../theme";
import { Flag, PanelShell } from "./atoms";
import { Matrix } from "./Matrix";
import { VerdictCard } from "./panels";

export function EvaluateStage({ uc, ev, setScore, setWeight, setThreshold, currentId, onSave, onNext }: {
  uc: UseCase;
  ev: Evaluation;
  setScore: (k: DimKey, v: number) => void;
  setWeight: (k: DimKey, v: number) => void;
  setThreshold: (k: "build" | "refine", v: number) => void;
  currentId: string | null;
  onSave: () => void;
  onNext: () => void;
}) {
  const wTotal = DIMS.reduce((s, d) => s + (Number(uc.weights[d.key]) || 0), 0);
  const T = uc.thresholds || { build: 70, refine: 45 };
  return (
    <div>
      <VerdictCard ev={ev} currentId={currentId} onSave={onSave} />
      {ev.flags.length > 0 && <div className="mb-5">{ev.flags.map((f, i) => <Flag key={i} sev={f.sev}>{f.text}</Flag>)}</div>}
      <div className="grid md:grid-cols-2 gap-6 items-start">
        <PanelShell n="02·A" title="Dimension scores & weights">
          {DIMS.map((d) => (
            <div key={d.key} className="mb-4">
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-semibold">{d.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.blue }}>{uc.scores[d.key]}/5 · w{normalizedWeights(uc.weights)[d.key].toFixed(0)}%</span>
              </div>
              <p className="text-xs mb-1" style={{ color: C.inkSoft }}>{d.help}</p>
              <div className="flex gap-3 items-center">
                <input type="range" min="0" max="5" step="1" value={uc.scores[d.key]} onChange={(e) => setScore(d.key, Number(e.target.value))} className="flex-1" aria-label={`${d.label} score`} />
                <input type="number" min="0" max="100" value={uc.weights[d.key]} onChange={(e) => setWeight(d.key, Number(e.target.value))} aria-label={`${d.label} weight`} style={{ ...inputStyle, width: 58, padding: "3px 6px", fontFamily: MONO, fontSize: 12 }} />
              </div>
            </div>
          ))}
          <p className="text-xs" style={{ fontFamily: MONO, color: wTotal === 100 ? C.inkSoft : C.amber }}>weights total {wTotal}{wTotal !== 100 ? " — normalized to 100 automatically" : ""}</p>
          <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-sm font-semibold">Verdict thresholds</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.inkSoft }}>composite cutoffs</span>
            </div>
            <p className="text-xs mb-2" style={{ color: C.inkSoft }}>Build if composite ≥ Build; Refine if ≥ Refine; otherwise Park. A critical flag still caps at Refine.</p>
            <div className="flex gap-4 items-center flex-wrap">
              <label className="flex items-center gap-2 text-sm">Build ≥ <input type="number" min="0" max="100" value={T.build} onChange={(e) => setThreshold("build", Number(e.target.value))} style={{ ...inputStyle, width: 64, padding: "3px 6px", fontFamily: MONO }} /></label>
              <label className="flex items-center gap-2 text-sm">Refine ≥ <input type="number" min="0" max="100" value={T.refine} onChange={(e) => setThreshold("refine", Number(e.target.value))} style={{ ...inputStyle, width: 64, padding: "3px 6px", fontFamily: MONO }} /></label>
            </div>
            {T.build <= T.refine && <p className="text-xs mt-1" style={{ color: C.amber }}>Build cutoff should exceed Refine cutoff, or the Refine band disappears.</p>}
          </div>
        </PanelShell>
        <div>
          <PanelShell n="02·B" title="Impact × Effort">
            <Matrix impact={ev.impact} effort={ev.effort} quadrant={ev.quadrant} name={uc.name} />
            <p className="text-xs mt-2" style={{ color: C.inkSoft }}>Impact = business-value score; effort = inverse of the cost/effort score.</p>
          </PanelShell>
          <PanelShell n="02·C" title="What's driving the composite">
            {[...ev.contribs].sort((a, b) => b.contrib - a.contrib).map((c) => (
              <div key={c.key} className="flex items-center gap-2 mb-1">
                <span className="text-xs w-40 shrink-0" style={{ color: C.inkSoft }}>{c.label}</span>
                <div className="flex-1 h-2" style={{ background: C.blueSoft }}>
                  <div style={{ width: `${(c.contrib / 25) * 100}%`, maxWidth: "100%", height: "100%", background: C.blue }} />
                </div>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.ink }}>{c.contrib.toFixed(1)}</span>
              </div>
            ))}
          </PanelShell>
        </div>
      </div>
      <div className="flex justify-end"><button onClick={onNext} style={btn(C.blue, "#fff")}>RECOMMEND →</button></div>
    </div>
  );
}
