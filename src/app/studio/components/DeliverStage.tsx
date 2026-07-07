"use client";

import type { Evaluation, UseCase } from "@/lib/engine";
import { buildSow, deliveryKitToMarkdown, type EngagementInputs } from "@/lib/deliverykit";
import { C, MONO, btn, inputStyle } from "../theme";
import { Eyebrow, Field, PanelShell, TextIn } from "./atoms";
import { SaveBar, type StoreStatus } from "./panels";
import { DeliverSections } from "./DeliverSections";

const COMMERCIAL_MODELS = ["Fixed fee", "Time & materials", "Retainer"];

/* Deliver stage (FABLE-BRIEF-DELIVERY-KIT DK-1 + DK-2 + DK-4). The post-BUILD step:
   - Shown for any evaluated case; when the verdict isn't BUILD, the SOW's
     own readiness note (buildSow returns it — not re-derived here) is
     surfaced prominently up top.
   - Engagement inputs bind to EngagementInputs and persist on the case
     payload (additive jsonb; the engine ignores them, M3's Zod passthrough
     carries them).
   - DeliverSections renders the four deliverables (discovery guide, SOW,
     delivery plan, risk register), each from its structured builder.
   - DK-4 exports: markdown download/copy via deliveryKitToMarkdown (zero
     deps), and a print stylesheet (mirroring ShowcaseBrief) so SAVE AS PDF
     prints the readiness note + four deliverables — the editing chrome
     (engagement form, save bar, studio header/nav) is marked `.no-print`. */
export function DeliverStage({ uc, ev, engagement, setEngagement, currentId, storeStatus, onSave, onNew, onCopy, onDownload, safeFile }: {
  uc: UseCase;
  ev: Evaluation;
  engagement: EngagementInputs;
  setEngagement: (e: EngagementInputs) => void;
  currentId: string | null;
  storeStatus: StoreStatus;
  onSave: () => void;
  onNew: () => void;
  onCopy: (text: string, label: string) => void;
  onDownload: (filename: string, text: string, mime: string) => void;
  safeFile: (n: string) => string;
}) {
  // Pull the readiness note straight from the SOW builder — don't re-derive it.
  const sow = buildSow(uc, engagement);
  const readiness = ev.verdict !== "BUILD" ? sow.sections.find((s) => s.heading === "Readiness note") : null;
  const noteColor = ev.verdict === "PARK" ? C.red : C.amber;
  const noteBg = ev.verdict === "PARK" ? C.redSoft : C.amberSoft;

  // Zero-dep markdown export — the full client-ready kit, disclaimer included.
  const kitMarkdown = deliveryKitToMarkdown(uc, engagement);

  const set = (k: keyof EngagementInputs) => (v: string | number) => setEngagement({ ...engagement, [k]: v });

  return (
    <div>
      {/* Print stylesheet mirrors ShowcaseBrief: hide `.no-print` chrome, white
          background, exact colours, sane page margins. Only mounted while the
          Deliver stage is active, so printing other tabs is unaffected. */}
      <style>{`@media print { .no-print{display:none !important;} @page{margin:14mm;} html,body{background:#fff !important;} *{-webkit-print-color-adjust:exact;print-color-adjust:exact;} }`}</style>

      <div className="flex justify-between items-start mb-5 flex-wrap gap-3">
        <div>
          <Eyebrow>Delivery kit</Eyebrow>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.01em" }}>{uc.name || "AI use case"}</h1>
          <p className="text-sm mt-1" style={{ color: C.inkSoft }}>
            {engagement.practitioner || "Lab Intelligence, LLC"} · verdict {ev.verdict} · {ev.composite.toFixed(0)}/100
          </p>
        </div>
        <div className="no-print flex gap-2 flex-wrap">
          <button onClick={() => onDownload(`${safeFile(uc.name)}-delivery-kit.md`, kitMarkdown, "text/markdown")} style={btn(C.blue, "#fff")}>DOWNLOAD MARKDOWN</button>
          <button onClick={() => onCopy(kitMarkdown, "Delivery kit")} style={btn(C.surface, C.ink, `1px solid ${C.ink}`)}>COPY MARKDOWN</button>
          <button onClick={() => window.print()} style={btn(C.ink, C.paper)}>SAVE AS PDF</button>
        </div>
      </div>
      <p className="no-print text-xs mb-5" style={{ color: C.inkSoft, fontFamily: MONO }}>
        SAVE AS PDF opens your browser&apos;s print dialog → choose &ldquo;Save as PDF.&rdquo; The engagement form and controls are omitted from the printout.
      </p>

      {readiness && (
        <div className="p-5 mb-5" style={{ background: noteBg, border: `1px solid ${noteColor}` }} role="alert">
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", color: noteColor }} className="uppercase mb-1">
            Readiness note — verdict is {ev.verdict}, not BUILD
          </div>
          <p className="text-sm leading-relaxed" style={{ color: C.ink }}>{readiness.body}</p>
        </div>
      )}

      <div className="no-print">
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
      </div>

      <DeliverSections uc={uc} engagement={engagement} />

      <div className="no-print">
        <SaveBar currentId={currentId} storeStatus={storeStatus} onSave={onSave} onNew={onNew} />
      </div>
    </div>
  );
}
