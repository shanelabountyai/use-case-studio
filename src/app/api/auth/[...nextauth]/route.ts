import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { hit, clientIp, LIMITS, tooMany } from "@/lib/rate-limit";

export const { GET } = handlers;

/* Sign-in POSTs (magic-link email requests, OAuth starts) are unauthenticated
   writes, and each magic-link request sends an email: cap them per client IP
   in the shared DB-backed limiter (scorecard K5). Other Auth.js POSTs
   (sign-out, session) pass straight through. */
export async function POST(req: NextRequest) {
  if (new URL(req.url).pathname.includes("/api/auth/signin")) {
    if (!(await hit(`signin:${clientIp(req)}`, LIMITS.signInPerIp))) {
      return new Response("Too many sign-in attempts. Try again later.", tooMany(900));
    }
  }
  return handlers.POST(req);
}
