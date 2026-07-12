import { NextResponse } from "next/server";
import { auth } from "@/auth";

/* Best-effort rate limit for the public /s/[token] reads.
   NOTE: this Map lives in the module scope of a single edge/serverless
   instance, so the counter is per-instance and resets on cold start — it
   throttles casual abuse and runaway loops against one instance, not a
   distributed flood. Durable, cross-instance limiting needs shared state
   (Vercel KV / Upstash). It is deliberately not the primary control: the
   192-bit token already makes brute-forcing a link infeasible, so this caps
   resource abuse (each hit runs DB queries + evaluate), not guessing. */
const WINDOW_MS = 60_000;
const MAX_HITS = 60; // per client IP, per window
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  // Cheap unbounded-growth guard: drop the whole table if it gets large.
  if (hits.size > 10_000) hits.clear();
  const rec = hits.get(ip);
  if (!rec || now > rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  rec.count++;
  return rec.count > MAX_HITS;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Public share reads: no auth, but rate-limited.
  if (pathname.startsWith("/s/")) {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    if (rateLimited(ip)) {
      return new NextResponse("Too many requests", {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    }
    return; // continue to the public page
  }

  // Everything else matched here (/studio/*) requires a session.
  if (!req.auth) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }
});

export const config = {
  matcher: ["/studio/:path*", "/s/:path*"],
};
