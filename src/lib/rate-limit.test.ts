import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture what hit() sends to the DB; resolve with the count the DB would return.
let returnedCount = 1;
const calls: { values?: unknown; conflict?: unknown }[] = [];
vi.mock("@/db", () => ({
  db: {
    insert: () => {
      const call: { values?: unknown; conflict?: unknown } = {};
      calls.push(call);
      const q = {
        values: (v: unknown) => { call.values = v; return q; },
        onConflictDoUpdate: (c: unknown) => { call.conflict = c; return q; },
        returning: async () => [{ count: returnedCount }],
      };
      return q;
    },
    delete: () => ({ where: async () => {} }),
  },
}));

import { hit, windowStart, clientIp, LIMITS } from "./rate-limit";

beforeEach(() => { calls.length = 0; returnedCount = 1; });

describe("windowStart", () => {
  it("floors to the window boundary", () => {
    expect(windowStart(125_000, 60_000).getTime()).toBe(120_000);
    expect(windowStart(120_000, 60_000).getTime()).toBe(120_000);
  });
});

describe("clientIp", () => {
  it("takes the first x-forwarded-for address, else unknown", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } }))).toBe("1.2.3.4");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});

describe("hit", () => {
  it("upserts one row per (key, window) and allows up to the limit", async () => {
    returnedCount = LIMITS.intakePerIp.limit;
    expect(await hit("intake:1.2.3.4", LIMITS.intakePerIp, 125_000)).toBe(true);
    expect(calls[0].values).toEqual({ key: "intake:1.2.3.4", windowStart: new Date(120_000), count: 1 });
    expect(calls[0].conflict).toBeDefined();
  });

  it("refuses once the shared count passes the limit", async () => {
    returnedCount = LIMITS.intakePerIp.limit + 1;
    expect(await hit("intake:1.2.3.4", LIMITS.intakePerIp)).toBe(false);
  });
});
