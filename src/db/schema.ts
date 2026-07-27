import { pgTable, text, timestamp, uuid, integer, jsonb, boolean, primaryKey, index } from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

/* Auth.js (NextAuth v5) standard tables for the Drizzle adapter */
export const users = pgTable("user", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable("account", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").$type<AdapterAccountType>().notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("providerAccountId").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
}, (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable("verificationToken", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
}, (t) => [primaryKey({ columns: [t.identifier, t.token] })]);

/* ---------------- Studio tables ---------------- */

export const useCases = pgTable("use_case", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  // Denormalized for cheap list views; source of truth is payload -> engine.evaluate()
  verdict: text("verdict").notNull(),
  composite: integer("composite").notNull(),
  quadrant: text("quadrant").notNull(),
  payload: jsonb("payload").notNull(), // full UseCase object (engine.ts shape)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* Build Kickoff (BK-0). One row per generated implementation plan; the row is
   also the async job (status drives queued→running→terminal). Versioned per
   case. `status` is plain text enforced by the KickoffStatus Zod enum in
   src/lib/kickoff/contracts.ts, matching the denormalized-text convention used
   for use_case.verdict above. jsonb columns mirror the PRD data contracts:
   plan=IntegratedPlan, audit=CriticAudit, laneStatus/provenance/cost as named.
   Job-runner columns (attempts, lease) are deferred to BK-1 with the runner
   decision (BK-S2) — they'd bake in a mechanism not yet chosen. */
export const buildKickoffPlans = pgTable("build_kickoff_plan", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => useCases.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  status: text("status").notNull(), // KickoffStatus enum, app-enforced
  plan: jsonb("plan"),              // IntegratedPlan | null
  audit: jsonb("audit"),            // CriticAudit | null
  laneStatus: jsonb("lane_status").notNull(),
  provenance: jsonb("provenance").notNull(),
  cost: jsonb("cost"),              // { inputTokens, outputTokens, usd } | null
  latencyMs: integer("latency_ms"), // run wall-clock, telemetry (BK-6)
  note: text("note"),               // human-readable detail: partial/failed reason (BK-1)
  // Runner columns (BK-1, DB-queue mechanism from BK-S2). A worker CAS-claims a
  // queued row and holds a lease; a dead worker's expired lease is reclaimable.
  attempts: integer("attempts").notNull().default(0),
  leaseUntil: timestamp("lease_until"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("bkp_case_version_idx").on(t.caseId, t.version),
  index("bkp_user_idx").on(t.userId),
]);

/* Inline feedback capture (BK-6): the seed of the eval corpus. One row per
   signal on a plan — "was this gap real?", "flag a fabrication", usable/not. */
export const kickoffFeedback = pgTable("kickoff_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => buildKickoffPlans.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),   // gap-real | fabrication | usable
  ref: text("ref"),               // which finding (e.g. gap title), nullable
  value: text("value").notNull(), // yes/no/rating payload
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("kfb_job_idx").on(t.jobId)]);

export const shareLinks = pgTable("share_link", {
  token: text("token").primaryKey(),
  useCaseId: uuid("use_case_id").notNull().references(() => useCases.id, { onDelete: "cascade" }),
  revoked: boolean("revoked").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
