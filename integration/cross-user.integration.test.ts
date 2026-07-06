import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, useCases, shareLinks } from "@/db/schema";
import { parseUseCase } from "@/lib/validation";
import { evaluate } from "@/lib/engine";
import { EXAMPLES } from "@/lib/examples";

/* Integration tests — exercise the REAL Postgres engine (no mocks), unlike
   the mocked route/unit tests. Intended to run against a disposable Neon
   BRANCH database in CI (.github/workflows/ci.yml creates and tears one down
   per run) — never dev or prod. If you run this locally, point .env's
   DATABASE_URL at a throwaway branch first: every row here is cleaned up in
   afterAll, but there's no undo for a mistake against a database that matters. */

const tag = `int-${crypto.randomUUID()}`;
const owned = (id: string, userId: string) => and(eq(useCases.id, id), eq(useCases.userId, userId));

const insertCase = async (userId: string, source = EXAMPLES[0]) => {
  const parsed = parseUseCase(source);
  if (!parsed.ok) throw new Error(`fixture failed validation: ${parsed.issues.join("; ")}`);
  const ev = evaluate(parsed.data);
  const [row] = await db.insert(useCases).values({
    userId, name: parsed.data.name, verdict: ev.verdict,
    composite: Math.round(ev.composite), quadrant: ev.quadrant, payload: parsed.data,
  }).returning();
  return row;
};

let ownerId: string;
let otherId: string;
let caseId: string;

beforeAll(async () => {
  const [owner] = await db.insert(users).values({ email: `${tag}-owner@test.local`, name: "Integration Owner" }).returning();
  const [other] = await db.insert(users).values({ email: `${tag}-other@test.local`, name: "Integration Other" }).returning();
  ownerId = owner.id;
  otherId = other.id;
});

afterAll(async () => {
  // Deleting the users cascades to their use_case/share_link rows (schema:
  // onDelete "cascade") — exercised directly in the cascade test below too.
  await db.delete(users).where(eq(users.id, ownerId));
  await db.delete(users).where(eq(users.id, otherId));
});

describe("cross-user isolation (real Postgres)", () => {
  it("a case created for one user is invisible to the owned() query for another", async () => {
    const row = await insertCase(ownerId);
    caseId = row.id;

    const [asOwner] = await db.select().from(useCases).where(owned(caseId, ownerId));
    const [asOther] = await db.select().from(useCases).where(owned(caseId, otherId));
    expect(asOwner?.id).toBe(caseId);
    expect(asOther).toBeUndefined();
  });

  it("clamps out-of-range scores before they ever reach the database", async () => {
    const dirty = { ...EXAMPLES[1], scores: { ...EXAMPLES[1].scores, value: 99, risk: -5 } };
    const parsed = parseUseCase(dirty);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const row = await insertCase(ownerId, parsed.data);
    const stored = row.payload as typeof parsed.data;
    expect(stored.scores.value).toBe(5);
    expect(stored.scores.risk).toBe(0);
    await db.delete(useCases).where(eq(useCases.id, row.id));
  });
});

describe("share links (real Postgres)", () => {
  it("revoking flips the row and the public (revoked=false) query excludes it", async () => {
    const token = `${tag}-token`;
    const [link] = await db.insert(shareLinks).values({ token, useCaseId: caseId }).returning();

    const [liveBefore] = await db.select().from(shareLinks).where(and(eq(shareLinks.token, link.token), eq(shareLinks.revoked, false)));
    expect(liveBefore?.token).toBe(token);

    await db.update(shareLinks).set({ revoked: true }).where(eq(shareLinks.token, token));

    const [liveAfter] = await db.select().from(shareLinks).where(and(eq(shareLinks.token, token), eq(shareLinks.revoked, false)));
    expect(liveAfter).toBeUndefined();
  });
});

describe("cascading delete (real Postgres)", () => {
  it("deleting the owning user removes their use_case and share_link rows", async () => {
    const [u] = await db.insert(users).values({ email: `${tag}-cascade@test.local`, name: "Cascade Test" }).returning();
    const uc = await insertCase(u.id);
    const token = `${tag}-cascade-token`;
    await db.insert(shareLinks).values({ token, useCaseId: uc.id });

    await db.delete(users).where(eq(users.id, u.id));

    const [remainingCase] = await db.select().from(useCases).where(eq(useCases.id, uc.id));
    const [remainingLink] = await db.select().from(shareLinks).where(eq(shareLinks.token, token));
    expect(remainingCase).toBeUndefined();
    expect(remainingLink).toBeUndefined();
  });
});
