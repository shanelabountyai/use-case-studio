import { describe, it, expect, vi, beforeEach } from "vitest";

// db.select() is called once per gate (concurrency, then daily). A results queue
// feeds each call its own count row.
let results: unknown[][] = [];
const chain = (rows: unknown[]) => {
  const p = Promise.resolve(rows) as Promise<unknown[]> & Record<string, unknown>;
  for (const m of ["from", "where"]) p[m] = () => p;
  return p;
};
vi.mock("@/db", () => ({ db: { select: () => chain(results.shift() ?? []) } }));

import { withinLimits, getLimits } from "./limits";

const limits = { tokenCap: 60000, timeoutMs: 120000, maxConcurrent: 1, dailyCeiling: 20 };

beforeEach(() => {
  results = [];
});

describe("withinLimits", () => {
  it("ok when under both gates", async () => {
    results = [[{ n: 0 }], [{ n: 3 }]];
    expect(await withinLimits("user-a", limits)).toEqual({ ok: true });
  });

  it("rejects at the concurrency limit", async () => {
    results = [[{ n: 1 }]]; // active >= maxConcurrent(1) — returns before daily query
    const r = await withinLimits("user-a", limits);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/in progress/);
  });

  it("rejects at the daily ceiling", async () => {
    results = [[{ n: 0 }], [{ n: 20 }]]; // concurrency ok, daily at ceiling
    const r = await withinLimits("user-a", limits);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Daily run limit/);
  });
});

describe("getLimits", () => {
  it("falls back to the BK-S1 defaults when env is unset", () => {
    delete process.env.KICKOFF_TOKEN_CAP;
    delete process.env.KICKOFF_MAX_CONCURRENT;
    const l = getLimits();
    expect(l.tokenCap).toBe(60_000);
    expect(l.maxConcurrent).toBe(1);
  });

  it("reads overrides from env", () => {
    process.env.KICKOFF_DAILY_CEILING = "5";
    expect(getLimits().dailyCeiling).toBe(5);
    delete process.env.KICKOFF_DAILY_CEILING;
  });
});
