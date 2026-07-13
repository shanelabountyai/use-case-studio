import Link from "next/link";
import { C, SANS, MONO } from "@/app/studio/theme";

/* 404. Also renders for the public /s/[token] route when a share link is
   unknown or revoked (page.tsx calls notFound()), so the copy stays neutral and
   safe for an unauthenticated visitor — no mention of the studio, no data leak.
   Home (/) handles auth state on its own. */
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: SANS,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
    >
      <div style={{ maxWidth: 460, textAlign: "center" }}>
        <p style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: C.blue, margin: "0 0 10px" }}>
          Error 404
        </p>
        <h1 style={{ fontSize: 28, lineHeight: 1.15, margin: "0 0 10px", fontWeight: 700 }}>
          This page isn&rsquo;t here
        </h1>
        <p style={{ fontSize: 15, color: C.inkSoft, margin: "0 0 22px" }}>
          The link may be mistyped, expired, or no longer shared. If someone sent
          you a brief, ask them for a fresh link.
        </p>
        <Link
          href="/"
          style={{
            fontFamily: MONO, fontSize: 12, letterSpacing: "0.04em", textDecoration: "none",
            background: C.blue, color: "#fff", padding: "10px 18px", display: "inline-block",
          }}
        >
          Go to the homepage
        </Link>
      </div>
    </main>
  );
}
