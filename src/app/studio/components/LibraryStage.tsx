"use client";

import { useState } from "react";
import type { LibraryRecord } from "@/lib/engine";
import { C, MONO, btn, inputStyle } from "../theme";
import { Flag, PanelShell } from "./atoms";
import { StoreChip, type StoreStatus, verdictColor } from "./panels";

export function LibraryStage({ library, currentId, storeStatus, onLoad, onDelete, onCopy, onDownload, libCsv, register }: {
  library: LibraryRecord[];
  currentId: string | null;
  storeStatus: StoreStatus;
  onLoad: (rec: LibraryRecord) => void;
  onDelete: (id: string) => void;
  onCopy: (text: string, label: string) => void;
  onDownload: (filename: string, text: string, mime: string) => void;
  libCsv: () => string;
  register: () => string;
}) {
  const [csvOpen, setCsvOpen] = useState(false);
  const [wireOpen, setWireOpen] = useState(false);
  return (
    <div>
      <PanelShell n="05·A" title="Saved use cases">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <StoreChip status={storeStatus} />
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => onDownload("ai-use-cases.csv", libCsv(), "text/csv")} style={btn(C.blue, "#fff")}>DOWNLOAD CSV</button>
            <button onClick={() => setCsvOpen((o) => !o)} style={btn(C.surface, C.ink, `1px solid ${C.ink}`)}>{csvOpen ? "HIDE CSV" : "COPY CSV"}</button>
            <button onClick={() => onDownload("AI Use-Case Register.md", register(), "text/markdown")} style={btn(C.surface, C.ink, `1px solid ${C.ink}`)}>REGISTER .MD</button>
            <button onClick={() => onCopy(register(), "Obsidian register")} style={btn(C.surface, C.ink, `1px solid ${C.ink}`)}>COPY REGISTER</button>
          </div>
        </div>
        {storeStatus === "memory" && <Flag sev="warn">Your library on the server couldn&apos;t be reached, so cases shown here live only for this session. Download the CSV or JSON to keep them, then reload to retry the connection.</Flag>}
        {csvOpen && (
          <div className="mb-4">
            <div className="flex gap-2 mb-2"><button onClick={() => onCopy(libCsv(), "CSV")} style={btn(C.blue, "#fff")}>COPY TO CLIPBOARD</button></div>
            <textarea readOnly value={libCsv()} onFocus={(e) => e.target.select()} style={{ ...inputStyle, fontFamily: MONO, fontSize: 11, height: 160, whiteSpace: "pre" }} />
          </div>
        )}
        {library.length === 0 ? (
          <p className="text-sm" style={{ color: C.inkSoft }}>Nothing saved yet. Evaluate a case, then hit &ldquo;Save to library.&rdquo;</p>
        ) : (
          <div style={{ border: `1px solid ${C.line}` }}>
            {library.map((r, i) => {
              const vc = verdictColor(r.verdict);
              return (
                <div key={r.id} className="flex items-center gap-3 p-3 flex-wrap" style={{ borderTop: i ? `1px solid ${C.line}` : "none", background: r.id === currentId ? C.blueSoft : C.surface }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: "#fff", background: vc, padding: "2px 6px" }}>{r.verdict}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{r.uc.name || "Untitled"}</div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.inkSoft }}>{r.composite}/100 · {r.quadrant.toLowerCase()} · {new Date(r.savedAt).toLocaleString()}</div>
                  </div>
                  <button onClick={() => onLoad(r)} style={btn(C.surface, C.ink, `1px solid ${C.ink}`)}>LOAD</button>
                  <button onClick={() => onDelete(r.id)} style={btn("transparent", C.red, `1px solid ${C.red}`)}>DELETE</button>
                </div>
              );
            })}
          </div>
        )}
      </PanelShell>

      <PanelShell n="05·B" title="Send results to an external store">
        <p className="text-sm leading-relaxed mb-2">This app deliberately holds no third-party credentials, so it doesn&apos;t call Google Sheets, Notion, or your Obsidian vault directly. The honest route keeps your secrets in your own connectors:</p>
        <button onClick={() => setWireOpen((o) => !o)} style={btn(C.surface, C.ink, `1px solid ${C.ink}`)} className="mb-3">{wireOpen ? "HIDE STEPS" : "SHOW WIRING STEPS"}</button>
        {wireOpen && (
          <div className="text-sm leading-relaxed" style={{ color: C.ink }}>
            <p className="mb-2"><strong>Claude pushes via your MCP connectors.</strong> Copy the CSV above (or a case&apos;s JSON from the Export tab), paste it into a Claude chat, and say where it goes: &ldquo;append to my Sheet&rdquo; → Zapier MCP (Google Sheets: Create Row); &ldquo;add to my Notion DB&rdquo; → Notion MCP (create pages, one per case); for <strong>Obsidian</strong>, use the note + register from the Export tab → your Obsidian MCP (<code style={{ fontFamily: MONO }}>create_note</code> per case, <code style={{ fontFamily: MONO }}>append_to_note</code> for the register). Credentials stay in your connectors, never in this app.</p>
            <p style={{ color: C.inkSoft }}>Direct Sheets/Notion API sync is intentionally out of scope for v1 — the copy/MCP path above covers it without this app ever holding a token.</p>
          </div>
        )}
      </PanelShell>
    </div>
  );
}
