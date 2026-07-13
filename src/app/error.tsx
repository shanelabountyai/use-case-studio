"use client";

import { useEffect } from "react";
import { C, SANS, MONO } from "@/app/studio/theme";

/* Route-level error boundary for a thrown/render error anywhere under the root
   layout. This catches unexpected crashes only — it does NOT touch the M2
   "save failed" honesty path, which is ordinary in-component state (a visible
   amber notice), not a thrown error. `reset()` re-renders the failed segment. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface for local debugging; production logging can hook in here later.
    console.error(error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: SANS,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
    >
      <div style={{ maxWidth: 460, textAlign: "center" }}>
        <p style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: C.red, margin: "0 0 10px" }}>
          Something broke
        </p>
        <h1 style={{ fontSize: 28, lineHeight: 1.15, margin: "0 0 10px", fontWeight: 700 }}>
          That didn&rsquo;t go as planned
        </h1>
        <p style={{ fontSize: 15, color: C.inkSoft, margin: "0 0 22px" }}>
          An unexpected error interrupted the page. Your saved work in the Library
          is unaffected. Try again, and if it keeps happening, reload.
        </p>
        {error?.digest ? (
          <p style={{ fontFamily: MONO, fontSize: 11, color: C.inkSoft, margin: "0 0 18px" }}>
            Reference: {error.digest}
          </p>
        ) : null}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={reset}
            style={{
              fontFamily: MONO, fontSize: 12, letterSpacing: "0.04em", cursor: "pointer",
              background: C.blue, color: "#fff", border: "none", padding: "10px 18px",
            }}
          >
            Try again
          </button>
          <a
            href="/"
            style={{
              fontFamily: MONO, fontSize: 12, letterSpacing: "0.04em", textDecoration: "none",
              background: C.surface, color: C.ink, border: `1px solid ${C.line}`, padding: "10px 18px",
            }}
          >
            Go home
          </a>
        </div>
      </div>
    </main>
  );
}
