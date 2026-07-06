import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, useCases } from "@/db/schema";
import { EXAMPLES } from "@/lib/examples";
import { seedExamplesForUser } from "@/lib/onboarding";

const tag = `int-onboarding-${crypto.randomUUID()}`;
let userId: string;

beforeAll(async () => {
  const [u] = await db.insert(users).values({ email: `${tag}@test.local`, name: "Onboarding Test" }).returning();
  userId = u.id;
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId)); // cascades to seeded use_case rows
});

describe("seedExamplesForUser (real Postgres)", () => {
  it("persists both worked examples for a brand-new user", async () => {
    await seedExamplesForUser(userId);
    const rows = await db.select().from(useCases).where(eq(useCases.userId, userId));
    expect(rows).toHaveLength(EXAMPLES.length);
    expect(rows.map((r) => r.name).sort()).toEqual(EXAMPLES.map((e) => e.name).sort());
  });
});
