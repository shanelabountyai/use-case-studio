"use client";

import type { Evaluation } from "@/lib/engine";
import { C, MONO, btn } from "../theme";

export type StoreStatus = "loading" | "connected" | "memory";

export const verdictColor = (verdict: string) =>
  verdict === "BUILD" ? C.green : verdict === "REFINE" ? C.amber : C.red;
export const verdictBg = (verdict: string) =>
  verdict === "BUILD" ? C.greenSoft : verdict === "REFINE" ? C.amberSoft : C.redSoft;

export const StoreChip = ({ status }: { status: StoreStatus }) => {
  const map: Record<StoreStatus, [string, string]> = {
    loading: ["#8FA0C9", "checking store…"],
    connected: [C.green, "persistent store: on"],
    memory: [C.amber, "session memory only"],
  };
  const [c, t] = map[status];
  return <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", color: c, border: `1px solid ${c}`, padding: "2px 6px", borderRadius: 2 }} className="uppercase">{t}</span>;
};

export const SaveBar = ({ currentId, storeStatus, onSave, onNew }: {
  currentId: string | null; storeStatus: StoreStatus; onSave: () => void; onNew: () => void;
}) => (
  <div className="flex gap-2 items-center flex-wrap mb-4">
    <button onClick={onSave} style={btn(C.blue, "#fff")}>{currentId ? "UPDATE IN LIBRARY" : "SAVE TO LIBRARY"}</button>
    {currentId && <button onClick={onNew} style={btn("transparent", C.inkSoft, `1px dashed ${C.inkSoft}`)}>NEW CASE</button>}
    <StoreChip status={storeStatus} />
    {currentId && <span style={{ fontFamily: MONO, fontSize: 10, color: C.inkSoft }}>editing a saved record</span>}
  </div>
);

export const VerdictCard = ({ ev, currentId, onSave }: { ev: Evaluation; currentId?: string | null; onSave?: () => void }) => {
  const vColor = verdictColor(ev.verdict);
  const vBg = verdictBg(ev.verdict);
  return (
    <div className="p-5 mb-5" style={{ background: vBg, border: `1px solid ${vColor}` }}>
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600, letterSpacing: "0.06em", color: vColor }}>{ev.verdict}</span>
        <span style={{ fontFamily: MONO, fontSize: 13, color: C.inkSoft }}>composite {ev.composite.toFixed(0)}/100 · {ev.quadrant.toLowerCase()}</span>
      </div>
      <p className="text-sm mt-2 leading-relaxed" style={{ color: C.ink }}>{ev.verdictWhy}</p>
      {onSave && <div className="mt-3"><button onClick={onSave} style={btn(vColor, "#fff")}>{currentId ? "UPDATE IN LIBRARY" : "SAVE TO LIBRARY"}</button></div>}
    </div>
  );
};
