import { afterAll, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { hit } from "@/lib/rate-limit";

/* The shared limiter against real Postgres (scorecard K5): the atomic upsert
   counts across calls, windows are independent, and the limit holds. */
const tag = `int-rl-${crypto.randomUUID()}`;

afterAll(async () => {
  await db.delete(rateLimits).where(like(rateLimits.key, `${tag}%`));
});

describe("hit (real Postgres)", () => {
  it("allows up to the limit in one window, then refuses", async () => {
    const lim = { limit: 3, windowMs: 60_000 };
    const now = 1_800_000_000_000;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await hit(`${tag}:a`, lim, now));
    expect(results).toEqual([true, true, true, false]);
  });

  it("starts a fresh count in the next window and per key", async () => {
    const lim = { limit: 1, windowMs: 60_000 };
    const now = 1_800_000_000_000;
    expect(await hit(`${tag}:b`, lim, now)).toBe(true);
    expect(await hit(`${tag}:b`, lim, now)).toBe(false);
    expect(await hit(`${tag}:b`, lim, now + 60_000)).toBe(true);
    expect(await hit(`${tag}:c`, lim, now)).toBe(true);
  });
});
