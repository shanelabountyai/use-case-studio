"use client";

import { C, SANS, MONO } from "@/app/studio/theme";

/* Last-resort boundary for an error thrown in the root layout itself. Next.js
   bypasses the layout here, so this file must render its own <html>/<body>.
   The IBM Plex CSS vars from the layout won't be defined in this path, so SANS
   falls back to the bundled/system font stack — intentional graceful degrade. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
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
              The app failed to load
            </h1>
            <p style={{ fontSize: 15, color: C.inkSoft, margin: "0 0 22px" }}>
              A low-level error stopped the page from rendering. Reloading usually
              clears it; your saved work is unaffected.
            </p>
            {error?.digest ? (
              <p style={{ fontFamily: MONO, fontSize: 11, color: C.inkSoft, margin: "0 0 18px" }}>
                Reference: {error.digest}
              </p>
            ) : null}
            <button
              onClick={reset}
              style={{
                fontFamily: MONO, fontSize: 12, letterSpacing: "0.04em", cursor: "pointer",
                background: C.blue, color: "#fff", border: "none", padding: "10px 18px",
              }}
            >
              Reload
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
