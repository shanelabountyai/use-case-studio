"use client";

import { OPT } from "@/lib/engine";
import { C, MONO, SANS, inputStyle } from "../theme";

export const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: C.blue }} className="uppercase mb-1">{children}</div>
);

export const Field = ({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) => (
  <label className="block mb-4">
    <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", color: C.inkSoft }} className="uppercase block mb-1">{label}</span>
    {children}
    {help && <span className="block mt-1 text-xs" style={{ color: C.inkSoft }}>{help}</span>}
  </label>
);

export const TextIn = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} style={inputStyle} />;

export const AreaIn = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea rows={3} {...p} style={{ ...inputStyle, resize: "vertical" }} />
);

export const SelIn = ({ group, value, onChange }: { group: string; value: string; onChange: React.ChangeEventHandler<HTMLSelectElement> }) => (
  <select value={value} onChange={onChange} style={inputStyle}>
    <option value="">— select —</option>
    {OPT[group].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>
);

export const Flag = ({ sev, children }: { sev: "critical" | "warn"; children: React.ReactNode }) => (
  <div className="flex gap-2 items-start p-3 mb-2" style={{ background: sev === "critical" ? C.redSoft : C.amberSoft, borderLeft: `3px solid ${sev === "critical" ? C.red : C.amber}` }}>
    <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", color: sev === "critical" ? C.red : C.amber, whiteSpace: "nowrap", paddingTop: 2 }} className="uppercase">{sev === "critical" ? "critical" : "flag"}</span>
    <span className="text-sm" style={{ color: C.ink }}>{children}</span>
  </div>
);

/* M5: loading placeholder rows. Tailwind's animate-pulse does the shimmer;
   blocks use the line/paper tokens so a skeleton reads as "structure, no data
   yet" rather than content. Screen readers get the label via role=status;
   the decorative blocks are aria-hidden. */
export const SkeletonRows = ({ rows = 3, label = "Loading…" }: { rows?: number; label?: string }) => (
  <div role="status" aria-label={label}>
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" style={{ border: `1px solid ${C.line}` }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 animate-pulse" style={{ borderTop: i ? `1px solid ${C.line}` : "none", background: C.surface }}>
          <div style={{ width: 52, height: 18, background: C.line }} />
          <div className="flex-1 min-w-0">
            <div style={{ width: "40%", height: 12, background: C.line, marginBottom: 6 }} />
            <div style={{ width: "65%", height: 9, background: C.paper, border: `1px solid ${C.line}` }} />
          </div>
          <div style={{ width: 56, height: 28, background: C.paper, border: `1px solid ${C.line}` }} />
        </div>
      ))}
    </div>
  </div>
);

export const PanelShell = ({ n, title, children }: { n: string; title: string; children: React.ReactNode }) => (
  <section className="mb-6 p-5" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
    <div className="flex items-baseline gap-3 mb-3">
      <span style={{ fontFamily: MONO, fontSize: 11, color: C.blue }}>{n}</span>
      <h3 style={{ fontFamily: SANS, fontWeight: 600, fontSize: 16, color: C.ink }}>{title}</h3>
    </div>
    {children}
  </section>
);
