"use client";

import type { UseCase } from "@/lib/engine";
import {
  buildDiscoveryGuide, buildSow, buildDeliveryPlan, buildRiskRegister,
  type EngagementInputs, type Risk,
} from "@/lib/deliverykit";
import { C, MONO } from "../theme";
import { Eyebrow, PanelShell } from "./atoms";

/* DK-2: render the four delivery-kit sections, each from its STRUCTURED
   builder output (never free text). Builders are imported from
   src/lib/deliverykit.ts and never reimplemented here. */

const PROBE = /^PROBE:\s*/;

const levelColor = (level: "Low" | "Medium" | "High") =>
  level === "High" ? C.red : level === "Medium" ? C.amber : C.green;

const SubLabel = ({ children }: { children: React.ReactNode }) => (
  <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", color: C.inkSoft }} className="uppercase">{children}</span>
);

function DiscoveryGuideSection({ uc }: { uc: UseCase }) {
  const guide = buildDiscoveryGuide(uc);
  return (
    <PanelShell n="06·B" title="Discovery guide">
      <p className="text-sm leading-relaxed mb-4" style={{ color: C.inkSoft }}>
        Structured intake. Targeted <strong>PROBE</strong> items appear wherever this case is thin or
        scored low — ask those first to sharpen the inputs the evaluation is least sure about.
      </p>
      {guide.sections.map((s) => (
        <div key={s.title} className="mb-4">
          <Eyebrow>{s.title}</Eyebrow>
          <div className="mt-1">
            {s.questions.map((q, i) => {
              if (PROBE.test(q)) {
                return (
                  <div key={i} className="flex gap-2 items-start p-2 mb-1" style={{ background: C.amberSoft, borderLeft: `3px solid ${C.amber}` }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", color: C.amber, whiteSpace: "nowrap", paddingTop: 2 }} className="uppercase">probe</span>
                    <span className="text-sm leading-relaxed" style={{ color: C.ink }}>{q.replace(PROBE, "")}</span>
                  </div>
                );
              }
              return <p key={i} className="text-sm leading-relaxed mb-1" style={{ paddingLeft: 14, textIndent: -14 }}>• {q}</p>;
            })}
          </div>
        </div>
      ))}
    </PanelShell>
  );
}

function SowSection({ uc, engagement }: { uc: UseCase; engagement: EngagementInputs }) {
  const sow = buildSow(uc, engagement);
  // The "Readiness note" section (present only when the verdict isn't BUILD)
  // is already surfaced prominently at the top of the Deliver stage (DK-1),
  // so it's filtered here to avoid rendering the identical paragraph twice.
  const sections = sow.sections.filter((s) => s.heading !== "Readiness note");
  return (
    <PanelShell n="06·C" title="Statement of work">
      {/* Disclaimer callout FIRST, always visible — never stripped from any view. */}
      <div className="p-3 mb-4" style={{ background: C.amberSoft, border: `1px solid ${C.amber}` }} role="note">
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", color: C.amber }} className="uppercase mb-1">Not legal advice</div>
        <p className="text-sm leading-relaxed" style={{ color: C.ink }}>{sow.disclaimer}</p>
      </div>
      {sections.map((s) => (
        <div key={s.heading} className="mb-3">
          <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.06em", color: C.blue }} className="uppercase">{s.heading}</span>
          <p className="text-sm leading-relaxed mt-1">{s.body}</p>
        </div>
      ))}
    </PanelShell>
  );
}

function DeliveryPlanSection({ uc, engagement }: { uc: UseCase; engagement: EngagementInputs }) {
  const plan = buildDeliveryPlan(uc, engagement);
  return (
    <PanelShell n="06·D" title="CPMAI-aligned delivery plan">
      <p className="text-xs leading-relaxed mb-4" style={{ color: C.inkSoft }}>{plan.note}</p>
      {plan.phases.map((p) => (
        <div key={p.phase} className="p-4 mb-3" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
          <div className="text-sm font-semibold mb-2" style={{ color: C.blue }}>{p.phase}</div>
          <p className="text-sm leading-relaxed mb-2"><SubLabel>Objective</SubLabel> <span>{p.objective}</span></p>
          <div className="mb-2">
            <SubLabel>Activities</SubLabel>
            <ul className="ml-5 mt-1">{p.activities.map((a, i) => <li key={i} className="text-sm leading-relaxed list-disc mb-1">{a}</li>)}</ul>
          </div>
          <div className="mb-2">
            <SubLabel>Deliverables</SubLabel>
            <ul className="ml-5 mt-1">{p.deliverables.map((d, i) => <li key={i} className="text-sm leading-relaxed list-disc mb-1">{d}</li>)}</ul>
          </div>
          <div>
            <SubLabel>Exit criteria</SubLabel>
            <p className="text-sm leading-relaxed mt-1">{p.exitCriteria}</p>
          </div>
        </div>
      ))}
    </PanelShell>
  );
}

const LI = ({ level }: { level: Risk["likelihood"] }) => (
  <span style={{ color: levelColor(level), fontWeight: 600 }} title={level}>{level[0]}</span>
);

function RiskRegisterSection({ uc }: { uc: UseCase }) {
  const reg = buildRiskRegister(uc);
  const th: React.CSSProperties = { fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", color: C.inkSoft, textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap" };
  const td: React.CSSProperties = { fontSize: 12, color: C.ink, padding: "6px 8px", borderTop: `1px solid ${C.line}`, verticalAlign: "top" };
  return (
    <PanelShell n="06·E" title="Risk register">
      <p className="text-xs leading-relaxed mb-3" style={{ color: C.inkSoft }}>
        Derived from this case&apos;s flags and scores, plus baseline adoption and vendor risks.
        <span className="ml-2">L/I = likelihood / impact:</span>
        <span className="ml-1" style={{ color: C.red, fontWeight: 600 }}>H</span> ·
        <span style={{ color: C.amber, fontWeight: 600 }}> M</span> ·
        <span style={{ color: C.green, fontWeight: 600 }}> L</span>
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
          <thead>
            <tr style={{ background: C.blueSoft }}>
              {["ID", "Risk", "Category", "L/I", "Mitigation", "Owner"].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {reg.risks.map((r) => (
              <tr key={r.id}>
                <td style={{ ...td, fontFamily: MONO, color: C.blue }}>{r.id}</td>
                <td style={td}>{r.risk}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{r.category}</td>
                <td style={{ ...td, fontFamily: MONO, whiteSpace: "nowrap" }}><LI level={r.likelihood} />/<LI level={r.impact} /></td>
                <td style={td}>{r.mitigation}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{r.owner}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PanelShell>
  );
}

export function DeliverSections({ uc, engagement }: { uc: UseCase; engagement: EngagementInputs }) {
  return (
    <>
      <DiscoveryGuideSection uc={uc} />
      <SowSection uc={uc} engagement={engagement} />
      <DeliveryPlanSection uc={uc} engagement={engagement} />
      <RiskRegisterSection uc={uc} />
    </>
  );
}
