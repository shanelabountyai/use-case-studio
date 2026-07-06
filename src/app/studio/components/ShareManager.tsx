"use client";

import { useCallback, useEffect, useState } from "react";
import { C, MONO, btn, inputStyle } from "../theme";
import { Flag, PanelShell } from "./atoms";

/* Owner UI for share links (FABLE-BRIEF M3). Self-contained: talks to
   /api/share-links directly and reflects create/revoke honestly, including
   inline errors on failure. A link can only be made for a SAVED case, since
   the public brief resolves a server record by id. */

interface ShareLink { token: string; useCaseId: string; revoked: boolean; createdAt: string }

export function ShareManager({ currentId }: { currentId: string | null }) {
  const savable = !!currentId && !currentId.startsWith("unsaved-");
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const load = useCallback(async () => {
    if (!savable) { setLinks([]); return; }
    try {
      const res = await fetch(`/api/share-links?useCaseId=${encodeURIComponent(currentId!)}`);
      if (!res.ok) throw new Error(String(res.status));
      setLinks(await res.json());
      setError("");
    } catch { setError("Couldn't load existing share links."); }
  }, [savable, currentId]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!savable) return;
    setBusy(true);
    try {
      const res = await fetch("/api/share-links", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useCaseId: currentId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const row: ShareLink = await res.json();
      setLinks((l) => [row, ...l]);
      setError("");
    } catch { setError("Couldn't create a share link — try again."); }
    finally { setBusy(false); }
  }

  async function revoke(token: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/share-links/${token}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      setLinks((l) => l.map((x) => (x.token === token ? { ...x, revoked: true } : x)));
      setError("");
    } catch { setError("Couldn't revoke that link — it may still be live."); }
    finally { setBusy(false); }
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(`${origin}/s/${token}`);
      setCopied(token); setTimeout(() => setCopied(null), 1500);
    } catch { setError("Clipboard blocked — select the URL and copy it manually."); }
  }

  return (
    <PanelShell n="04·E" title="Share a read-only brief">
      <p className="text-sm leading-relaxed mb-3">
        Create an unguessable public link to this case&apos;s Showcase brief. It shows the branded
        brief only — no login, no practitioner controls, none of your other cases — and stops
        working the moment you revoke it.
      </p>
      {!savable ? (
        <p className="text-sm" style={{ color: C.inkSoft }}>Save this case to your library first — a share link points at a saved record.</p>
      ) : (
        <>
          <button onClick={create} disabled={busy} style={btn(C.blue, "#fff")} className="mb-3">CREATE SHARE LINK</button>
          {error && <Flag sev="warn">{error}</Flag>}
          {links.length === 0 ? (
            <p className="text-sm" style={{ color: C.inkSoft }}>No share links for this case yet.</p>
          ) : (
            <div style={{ border: `1px solid ${C.line}` }}>
              {links.map((l, i) => (
                <div key={l.token} className="flex items-center gap-2 p-2 flex-wrap" style={{ borderTop: i ? `1px solid ${C.line}` : "none", background: C.surface }}>
                  <input readOnly value={`${origin}/s/${l.token}`} onFocus={(e) => e.target.select()}
                    style={{ ...inputStyle, flex: 1, minWidth: 180, fontFamily: MONO, fontSize: 11, textDecoration: l.revoked ? "line-through" : "none", color: l.revoked ? C.inkSoft : C.ink }} />
                  {l.revoked ? (
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.red, border: `1px solid ${C.red}`, padding: "2px 6px" }} className="uppercase">revoked</span>
                  ) : (
                    <>
                      <button onClick={() => copy(l.token)} style={btn(C.surface, C.ink, `1px solid ${C.ink}`)}>{copied === l.token ? "COPIED ✓" : "COPY"}</button>
                      <button onClick={() => revoke(l.token)} disabled={busy} style={btn("transparent", C.red, `1px solid ${C.red}`)}>REVOKE</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </PanelShell>
  );
}
