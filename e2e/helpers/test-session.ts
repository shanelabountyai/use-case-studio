import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { BrowserContext } from "@playwright/test";
import { db } from "@/db";
import { users, sessions } from "@/db/schema";

/* e2e auth bypass: inserts a real user + database-session row directly (the
   same tables/shape Auth.js's DrizzleAdapter would populate on a real
   sign-in), then sets the session cookie in the browser context. Real Google
   OAuth / Resend magic-link sign-in can't be automated headlessly in CI
   without live test credentials — this exercises the app's real
   database-session strategy end to end (the exact lookup path a genuine
   sign-in populates) without driving an actual OAuth redirect. */

export interface TestSession { userId: string; email: string; sessionToken: string }

async function setSessionCookie(context: BrowserContext, sessionToken: string, expires: Date) {
  await context.addCookies([{
    name: "authjs.session-token",
    value: sessionToken,
    domain: "localhost",
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    expires: Math.floor(expires.getTime() / 1000),
  }]);
}

export async function createTestSession(context: BrowserContext, opts?: { email?: string }): Promise<TestSession> {
  const email = opts?.email ?? `e2e-${randomUUID()}@test.local`;
  const [user] = await db.insert(users).values({ email, name: "E2E Test User" }).returning();
  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ sessionToken, userId: user.id, expires });
  await setSessionCookie(context, sessionToken, expires);
  return { userId: user.id, email, sessionToken };
}

/** Re-issue a fresh session for an existing user id — stands in for "sign
 *  back in" without a real OAuth round-trip, proving data persisted under
 *  the same user across the sign-out/sign-in cycle. */
export async function reissueSession(context: BrowserContext, userId: string): Promise<string> {
  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ sessionToken, userId, expires });
  await setSessionCookie(context, sessionToken, expires);
  return sessionToken;
}

/** Deletes the user row (cascades to their sessions/use_cases/share_links). */
export async function destroyTestSession(userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}
