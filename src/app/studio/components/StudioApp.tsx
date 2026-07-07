"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  blankCase, buildIndexEntry, buildObsidianNote, buildPrompt, evaluate,
  libraryToCsv, recArchitecture, recDataAccess, recTesting,
  type DimKey, type LibraryRecord, type UseCase, type Verdict,
} from "@/lib/engine";
import { EXAMPLES } from "@/lib/examples";
import { buildRegister } from "@/lib/register";
import { blankEngagement, type EngagementInputs } from "@/lib/deliverykit";
import { C, MONO, SANS, btn } from "../theme";
import { CaptureStage } from "./CaptureStage";
import { EvaluateStage } from "./EvaluateStage";
import { RecommendStage } from "./RecommendStage";
import { ExportStage } from "./ExportStage";
import { LibraryStage } from "./LibraryStage";
import { DeliverStage } from "./DeliverStage";
import { ShowcaseBrief } from "./ShowcaseBrief";
import { StoreChip, type StoreStatus } from "./panels";

const STAGES = ["Capture", "Evaluate", "Recommend", "Export", "Library", "Deliver"];

/* Engagement inputs (DK-1) persist as an additive top-level key on the case
   payload — the engine ignores unknown fields and M3's Zod schema passes them
   through. Read it back tolerantly so pre-DK-1 records (no engagement) load
   with sensible defaults. */
type CasePayload = UseCase & { engagement?: Partial<EngagementInputs> };
const readEngagement = (uc: UseCase): EngagementInputs => ({
  ...blankEngagement(),
  ...((uc as CasePayload).engagement || {}),
});

/* Rows returned by /api/use-cases (denormalized columns computed server-side). */
interface ApiRow { id: string; name: string; verdict: Verdict; composite: number; quadrant: string; payload: UseCase; updatedAt: string; }

const rowToRecord = (row: ApiRow): LibraryRecord => ({
  id: row.id, savedAt: row.updatedAt, uc: row.payload,
  verdict: row.verdict, composite: row.composite, quadrant: row.quadrant,
});

const hydrate = (p: Partial<UseCase>): UseCase => ({
  ...blankCase(), ...p,
  scores: { ...blankCase().scores, ...(p.scores || {}) },
  weights: { ...blankCase().weights, ...(p.weights || {}) },
  thresholds: { ...blankCase().thresholds, ...(p.thresholds || {}) },
});

function download(filename: string, text: string, mime: string): boolean {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    return true;
  } catch { return false; }
}

const safeFile = (n: string) => String(n || "use-case").replace(/[\\/:*?"<>|]+/g, "-").trim();

export default function StudioApp() {
  const [uc, setUc] = useState<UseCase>(EXAMPLES[0]);
  const [engagement, setEngagement] = useState<EngagementInputs>(() => readEngagement(EXAMPLES[0]));
  const [stage, setStage] = useState(0);
  const [showcase, setShowcase] = useState(false);
  const [copied, setCopied] = useState(false);
  const [library, setLibrary] = useState<LibraryRecord[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [storeStatus, setStoreStatus] = useState<StoreStatus>("loading");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/use-cases");
        if (!res.ok) throw new Error(String(res.status));
        const rows: ApiRow[] = await res.json();
        if (live) { setLibrary(rows.map(rowToRecord)); setStoreStatus("connected"); }
      } catch {
        if (live) setStoreStatus("memory");
      }
    })();
    return () => { live = false; };
  }, []);

  const ev = useMemo(() => evaluate(uc), [uc]);
  const arch = useMemo(() => recArchitecture(uc), [uc]);
  const data = useMemo(() => recDataAccess(uc), [uc]);
  const test = useMemo(() => recTesting(uc), [uc]);
  const prompt = useMemo(() => buildPrompt(uc), [uc]);

  const setField = (k: Exclude<keyof UseCase, "scores" | "weights" | "thresholds">, v: string) => setUc({ ...uc, [k]: v });
  const setScore = (k: DimKey, v: number) => setUc({ ...uc, scores: { ...uc.scores, [k]: v } });
  const setWeight = (k: DimKey, v: number) => setUc({ ...uc, weights: { ...uc.weights, [k]: v } });
  const setThreshold = (k: "build" | "refine", v: number) => setUc({ ...uc, thresholds: { ...(uc.thresholds || { build: 70, refine: 45 }), [k]: v } });

  const flash = (m: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(m);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  };

  /* Save = optimistic local record + server write. Verdict/composite/quadrant
     shown in the library come from the SERVER row (never the client's math) —
     the optimistic entry is reconciled or honestly marked failed. */
  async function saveToLibrary() {
    // Engagement rides along as an additive key on the persisted payload; the
    // engine ignores it and the server recomputes the verdict from the scores.
    const snapshot: CasePayload = { ...JSON.parse(JSON.stringify(uc)), engagement };
    const optimistic: LibraryRecord = {
      id: currentId || `unsaved-${Date.now().toString(36)}`,
      savedAt: new Date().toISOString(), uc: snapshot,
      verdict: ev.verdict as Verdict, composite: Number(ev.composite.toFixed(1)), quadrant: ev.quadrant,
    };
    const isUpdate = !!currentId && !currentId.startsWith("unsaved-");
    setLibrary(isUpdate ? library.map((r) => (r.id === currentId ? optimistic : r)) : [optimistic, ...library.filter((r) => r.id !== optimistic.id)]);
    try {
      const res = await fetch(isUpdate ? `/api/use-cases/${currentId}` : "/api/use-cases", {
        method: isUpdate ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      if (!res.ok) throw new Error(String(res.status));
      const row: ApiRow = await res.json();
      const rec = rowToRecord(row);
      setLibrary((lib) => lib.map((r) => (r.id === optimistic.id ? rec : r)));
      setCurrentId(rec.id);
      setStoreStatus("connected");
      flash(isUpdate ? "Updated in library" : "Saved to library");
    } catch {
      // The optimistic record stays visible but honestly unsynced: the chip
      // flips to "session memory only" and the id stays local so the next
      // save retries a create instead of updating a row that never existed.
      setCurrentId(optimistic.id.startsWith("unsaved-") ? optimistic.id : currentId);
      flash("Save failed — kept in this session only");
      setStoreStatus("memory");
    }
  }

  function loadRecord(rec: LibraryRecord) {
    setUc(hydrate(rec.uc));
    setEngagement(readEngagement(rec.uc));
    setCurrentId(rec.id); setStage(1); setShowcase(false);
    flash(`Loaded “${rec.uc.name || "untitled"}”`);
  }

  async function deleteRecord(id: string) {
    const prev = library;
    setLibrary(library.filter((r) => r.id !== id));
    if (currentId === id) setCurrentId(null);
    if (id.startsWith("unsaved-")) { flash("Removed"); return; }
    try {
      const res = await fetch(`/api/use-cases/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      flash("Removed");
    } catch {
      setLibrary(prev);
      flash("Delete failed — the record is still in your library");
    }
  }

  const newCase = () => { setUc(blankCase()); setEngagement(blankEngagement()); setCurrentId(null); setStage(0); flash("New blank case"); };

  const doExportJson = () => {
    const payload: CasePayload = { ...uc, engagement };
    if (!download(`${(uc.name || "use-case").replace(/\s+/g, "-").toLowerCase()}.json`, JSON.stringify(payload, null, 2), "application/json")) flash("Download blocked — use Copy instead");
  };
  const doImport = (file: File) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const p = JSON.parse(String(r.result));
        setUc(hydrate(p)); setEngagement(readEngagement(p)); setCurrentId(null); flash("Imported");
      } catch { flash("That file isn't valid JSON from this tool."); }
    };
    r.readAsText(file);
  };

  const currentRecord = (): LibraryRecord => ({
    id: currentId || "(unsaved)", savedAt: new Date().toISOString(), uc,
    verdict: ev.verdict as Verdict, composite: Number(ev.composite.toFixed(1)), quadrant: ev.quadrant,
  });
  const currentCsv = () => libraryToCsv([currentRecord()]);
  const libCsv = () => (library.length ? libraryToCsv(library) : currentCsv());
  const doCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true); setTimeout(() => setCopied(false), 1500);
      flash(`${label} copied`);
    } catch { flash("Clipboard blocked — select the text manually"); }
  };
  const doDownload = (filename: string, text: string, mime: string) => {
    if (!download(filename, text, mime)) flash("Download blocked — use Copy instead");
  };
  const obsSavedAt = library.find((r) => r.id === currentId)?.savedAt;
  const register = () => buildRegister(library.length ? library : [currentRecord()]);

  if (showcase) {
    return <ShowcaseBrief uc={uc} ev={ev} arch={arch} onBack={() => setShowcase(false)} />;
  }

  return (
    <div style={{ background: C.paper, minHeight: "100vh", fontFamily: SANS, color: C.ink }} className="px-4 py-6 sm:px-8">
      <style>{`input[type=range]{accent-color:${C.blue};}
        button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid ${C.blue};outline-offset:2px;}`}</style>
      <div className="max-w-3xl mx-auto">

        <header className="mb-6 no-print">
          <div className="flex justify-between items-start flex-wrap gap-3">
            <div>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: C.blue }} className="uppercase mb-1">Lab Intelligence · decision instrument</div>
              <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>AI Use-Case Studio</h1>
              <p className="text-sm mt-1" style={{ color: C.inkSoft }}>From raw idea to a defensible build / refine / park decision — saved to a library you can export.</p>
            </div>
            <div className="flex gap-2 items-center">
              <StoreChip status={storeStatus} />
              <button onClick={() => setShowcase(true)} style={btn(C.ink, C.paper)}>SHOWCASE BRIEF</button>
            </div>
          </div>
          <div className="flex gap-2 mt-4 flex-wrap items-center">
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", color: C.inkSoft }} className="uppercase">Load example:</span>
            {EXAMPLES.map((ex, i) => (
              <button key={i} onClick={() => { setUc(JSON.parse(JSON.stringify(ex))); setEngagement(readEngagement(ex)); setCurrentId(null); setStage(0); }} style={btn(C.surface, C.ink, `1px solid ${C.line}`)}>{ex.name}</button>
            ))}
            <button onClick={newCase} style={btn("transparent", C.inkSoft, `1px dashed ${C.inkSoft}`)}>blank</button>
          </div>
        </header>

        <nav className="flex mb-6 overflow-x-auto no-print" style={{ borderBottom: `1px solid ${C.line}` }} aria-label="Stages">
          {STAGES.map((s, i) => (
            <button key={s} onClick={() => setStage(i)} className="px-3 sm:px-4 py-2 text-sm whitespace-nowrap" style={{ fontFamily: MONO, letterSpacing: "0.04em", background: "transparent", border: "none", borderBottom: stage === i ? `2px solid ${C.blue}` : "2px solid transparent", color: stage === i ? C.blue : C.inkSoft, cursor: "pointer", fontWeight: stage === i ? 600 : 400 }}>
              {String(i + 1).padStart(2, "0")} {s}{i === 4 && library.length ? ` (${library.length})` : ""}
            </button>
          ))}
        </nav>

        {stage === 0 && (
          <CaptureStage uc={uc} setField={setField} currentId={currentId} storeStatus={storeStatus} onSave={saveToLibrary} onNew={newCase} onNext={() => setStage(1)} />
        )}
        {stage === 1 && (
          <EvaluateStage uc={uc} ev={ev} setScore={setScore} setWeight={setWeight} setThreshold={setThreshold} currentId={currentId} onSave={saveToLibrary} onNext={() => setStage(2)} />
        )}
        {stage === 2 && (
          <RecommendStage uc={uc} ev={ev} arch={arch} data={data} test={test} currentId={currentId} onSave={saveToLibrary} onNext={() => setStage(3)} />
        )}
        {stage === 3 && (
          <ExportStage
            ucName={uc.name} prompt={prompt}
            obsNote={buildObsidianNote(uc, obsSavedAt)} obsEntry={buildIndexEntry(uc, obsSavedAt)}
            copied={copied} currentId={currentId} storeStatus={storeStatus}
            onSave={saveToLibrary} onNew={newCase} onOpenShowcase={() => setShowcase(true)}
            onExportJson={doExportJson} onImportFile={doImport}
            onCopy={doCopy} onDownload={doDownload} currentCsv={currentCsv} safeFile={safeFile}
          />
        )}
        {stage === 4 && (
          <LibraryStage
            library={library} currentId={currentId} storeStatus={storeStatus}
            onLoad={loadRecord} onDelete={deleteRecord}
            onCopy={doCopy} onDownload={doDownload} libCsv={libCsv} register={register}
          />
        )}
        {stage === 5 && (
          <DeliverStage
            uc={uc} ev={ev} engagement={engagement} setEngagement={setEngagement}
            currentId={currentId} storeStatus={storeStatus} onSave={saveToLibrary} onNew={newCase}
            onCopy={doCopy} onDownload={doDownload} safeFile={safeFile}
          />
        )}

        {toast && <div style={{ position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", background: C.ink, color: C.paper, fontFamily: MONO, fontSize: 12, padding: "8px 14px", zIndex: 50 }} role="status">{toast}</div>}

        <footer className="mt-8 pt-4 text-xs flex justify-between flex-wrap gap-2" style={{ borderTop: `1px solid ${C.line}`, color: C.inkSoft, fontFamily: MONO }}>
          <span>Heuristic instrument — outputs are defensible starting points, not guarantees.</span>
          <span>CRISP-DM · NIST AI RMF 1.0 · TRL/DRL · Impact×Effort</span>
        </footer>
      </div>
    </div>
  );
}
