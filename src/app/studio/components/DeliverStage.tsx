"use client";

import type { Evaluation, UseCase } from "@/lib/engine";
import { buildSow, type EngagementInputs } from "@/lib/deliverykit";
import { C, MONO, inputStyle } from "../theme";
import { Field, PanelShell, TextIn } from "./atoms";
import { SaveBar, type StoreStatus } from "./panels";
import { DeliverSections } from "./DeliverSections";

const COMMERCIAL_MODELS = ["Fixed fee", "Time & materials", "Retainer"];

/* Deliver stage (FABLE-BRIEF-DELIVERY-KIT DK-1 + DK-2). The post-BUILD step:
   - Shown for any evaluated case; when the verdict isn't BUILD, the SOW's
     own readiness note (buildSow returns it — not re-derived here) is
     surfaced prominently up top.
   - Engagement inputs bind to EngagementInputs and persist on the case
     payload (additive jsonb; the engine ignores them, M3's Zod passthrough
     carries them).
   - DeliverSections renders the four deliverables (discovery guide, SOW,
     delivery plan, risk register), each from its structured builder. */
export function DeliverStage({ uc, ev, engagement, setEngagement, currentId, storeStatus, onSave, onNew }: {
  uc: UseCase;
  ev: Evaluation;
  engagement: EngagementInputs;
  setEngagement: (e: EngagementInputs) => void;
  currentId: string | null;
  storeStatus: StoreStatus;
  onSave: () => void;
  onNew: () => void;
}) {
  // Pull the readiness note straight from the SOW builder — don't re-derive it.
  const sow = buildSow(uc, engagement);
  const readiness = ev.verdict !== "BUILD" ? sow.sections.find((s) => s.heading === "Readiness note") : null;
  const noteColor = ev.verdict === "PARK" ? C.red : C.amber;
  const noteBg = ev.verdict === "PARK" ? C.redSoft : C.amberSoft;

  const set = (k: keyof EngagementInputs) => (v: string | number) => setEngagement({ ...engagement, [k]: v });

  return (
    <div>
      {readiness && (
        <div className="p-5 mb-5" style={{ background: noteBg, border: `1px solid ${noteColor}` }} role="alert">
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", color: noteColor }} className="uppercase mb-1">
            Readiness note — verdict is {ev.verdict}, not BUILD
          </div>
          <p className="text-sm leading-relaxed" style={{ color: C.ink }}>{readiness.body}</p>
        </div>
      )}

      <PanelShell n="06·A" title="Engagement inputs">
        <p className="text-sm leading-relaxed mb-4" style={{ color: C.inkSoft }}>
          These frame the statement of work, delivery plan, and risk register. They&apos;re saved with the
          case and stay editable — nothing here changes the verdict, which is always computed from the
          scores on the server.
        </p>
        <div className="grid sm:grid-cols-2 gap-x-5">
          <Field label="Client"><TextIn value={engagement.client} onChange={(e) => set("client")(e.target.value)} placeholder="e.g. Acme Corp" /></Field>
          <Field label="Executive sponsor" help="Decision owner who signs off checkpoints."><TextIn value={engagement.sponsor} onChange={(e) => set("sponsor")(e.target.value)} placeholder="e.g. VP Operations" /></Field>
          <Field label="Practitioner"><TextIn value={engagement.practitioner} onChange={(e) => set("practitioner")(e.target.value)} /></Field>
          <Field label="Duration (weeks)"><TextIn type="number" min={1} value={engagement.durationWeeks} onChange={(e) => set("durationWeeks")(Number(e.target.value))} /></Field>
          <Field label="Start date"><TextIn type="date" value={engagement.startDate ? engagement.startDate.slice(0, 10) : ""} onChange={(e) => set("startDate")(e.target.value)} /></Field>
          <Field label="Commercial model">
            <select value={engagement.commercialModel} onChange={(e) => set("commercialModel")(e.target.value)} style={inputStyle} aria-label="Commercial model">
              {COMMERCIAL_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>
      </PanelShell>

      <DeliverSections uc={uc} engagement={engagement} />

      <SaveBar currentId={currentId} storeStatus={storeStatus} onSave={onSave} onNew={onNew} />
    </div>
  );
}
