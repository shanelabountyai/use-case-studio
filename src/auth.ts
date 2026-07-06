import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // Resend reads AUTH_RESEND_KEY automatically (Auth.js env-var convention); the
  // adapter's verificationTokens table backs the magic-link flow. `from` must be
  // a Resend-verified sender — their shared test domain works without DNS setup.
  providers: [Google, Resend({ from: "onboarding@resend.dev" })],
});
