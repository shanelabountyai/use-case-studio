import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { hit, clientIp, LIMITS, tooMany } from "@/lib/rate-limit";

/* Rate limit for the public /s/[token] reads (scorecard K5). Counters live in
   Postgres (src/lib/rate-limit.ts), so the cap holds across every edge or
   serverless instance and survives cold starts — the old per-instance Map did
   neither. It is not the primary control: the 192-bit token already makes
   brute-forcing a link infeasible, so this caps resource abuse (each hit runs
   DB queries + evaluate), not guessing. */
export default auth(async (req) => {
  const { pathname } = req.nextUrl;

  // Public share reads: no auth, but rate-limited.
  if (pathname.startsWith("/s/")) {
    if (!(await hit(`share:${clientIp(req)}`, LIMITS.shareReadPerIp))) {
      return new NextResponse("Too many requests", tooMany(60));
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
