"use client";

import { useRef } from "react";
import { C, MONO, btn } from "../theme";
import { PanelShell } from "./atoms";
import { SaveBar, type StoreStatus } from "./panels";
import { ShareManager } from "./ShareManager";

export function ExportStage({ ucName, prompt, obsNote, obsEntry, copied, currentId, storeStatus, onSave, onNew, onOpenShowcase, onExportJson, onImportFile, onCopy, onDownload, currentCsv, safeFile }: {
  ucName: string;
  prompt: string;
  obsNote: string;
  obsEntry: string;
  copied: boolean;
  currentId: string | null;
  storeStatus: StoreStatus;
  onSave: () => void;
  onNew: () => void;
  onOpenShowcase: () => void;
  onExportJson: () => void;
  onImportFile: (file: File) => void;
  onCopy: (text: string, label: string) => void;
  onDownload: (filename: string, text: string, mime: string) => void;
  currentCsv: () => string;
  safeFile: (n: string) => string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <PanelShell n="04·A" title="One-page brief">
        <p className="text-sm leading-relaxed mb-3">The Showcase view renders this analysis as a clean, client-ready brief — same numbers, plain language.</p>
        <button onClick={onOpenShowcase} style={btn(C.ink, C.paper)}>OPEN SHOWCASE BRIEF</button>
      </PanelShell>
      <PanelShell n="04·B" title="This case — save & export">
        <SaveBar currentId={currentId} storeStatus={storeStatus} onSave={onSave} onNew={onNew} />
        <div className="flex gap-2 flex-wrap">
          <button onClick={onExportJson} style={btn(C.blue, "#fff")}>DOWNLOAD JSON</button>
          <button onClick={() => fileRef.current && fileRef.current.click()} style={btn(C.surface, C.ink, `1px solid ${C.ink}`)}>IMPORT JSON</button>
          <button onClick={() => onCopy(currentCsv(), "Row CSV")} style={btn(C.surface, C.ink, `1px solid ${C.ink}`)}>COPY THIS ROW (CSV)</button>
          <input ref={fileRef} type="file" accept="application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); e.target.value = ""; }} className="hidden" aria-label="Import session JSON" />
        </div>
      </PanelShell>
      <ShareManager currentId={currentId} />
      <PanelShell n="04·C" title="Reusable prompt — seeded with this case">
        <p className="text-sm leading-relaxed mb-3">The same intake → evaluation → recommendation logic as a portable prompt, pre-filled with your current inputs. Runs in any capable LLM chat.</p>
        <button onClick={() => onCopy(prompt, "Prompt")} style={btn(copied ? C.green : C.blue, "#fff")} className="mb-3">{copied ? "COPIED ✓" : "COPY PROMPT"}</button>
        <pre className="text-xs p-3 overflow-auto" style={{ fontFamily: MONO, background: "#F0F2ED", border: `1px solid ${C.line}`, maxHeight: 320, whiteSpace: "pre-wrap", color: C.ink }}>{prompt}</pre>
      </PanelShell>
      <PanelShell n="04·D" title="Obsidian note — one per case">
        <p className="text-sm leading-relaxed mb-2">Vault-ready Markdown. The YAML frontmatter becomes Obsidian <strong>Properties</strong> — verdict, composite, the seven scores, sensitivity, tags — with the full analysis in the body and a link back to <code style={{ fontFamily: MONO }}>[[AI Use-Case Register]]</code>.</p>
        <p className="text-xs mb-3" style={{ color: C.inkSoft }}>Suggested filename: <code style={{ fontFamily: MONO }}>{safeFile(ucName || "Untitled AI use case")}.md</code>. Create it via your Obsidian MCP (<code style={{ fontFamily: MONO }}>create_note</code>); append the index entry to the register (<code style={{ fontFamily: MONO }}>append_to_note</code>).</p>
        <div className="flex gap-2 flex-wrap mb-3">
          <button onClick={() => onDownload(`${safeFile(ucName)}.md`, obsNote, "text/markdown")} style={btn(C.blue, "#fff")}>DOWNLOAD .MD</button>
          <button onClick={() => onCopy(obsNote, "Obsidian note")} style={btn(C.surface, C.ink, `1px solid ${C.ink}`)}>COPY NOTE</button>
          <button onClick={() => onCopy(obsEntry, "Index entry")} style={btn(C.surface, C.ink, `1px solid ${C.ink}`)}>COPY INDEX ENTRY</button>
        </div>
        <pre className="text-xs p-3 overflow-auto" style={{ fontFamily: MONO, background: "#F0F2ED", border: `1px solid ${C.line}`, maxHeight: 320, whiteSpace: "pre-wrap", color: C.ink }}>{obsNote}</pre>
      </PanelShell>
    </div>
  );
}
