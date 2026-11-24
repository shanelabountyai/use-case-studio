import { describe, it, expect, vi, beforeEach } from "vitest";

// A chainable stub whose terminal await resolves to the given rows.
const chain = (rows: unknown[]) => {
  const p = Promise.resolve(rows) as Promise<unknown[]> & Record<string, unknown>;
  for (const m of ["from", "where", "limit", "values", "set", "returning"]) p[m] = () => p;
  return p;
};
const insert = vi.fn(() => chain([]));
vi.mock("@/db", () => ({
  db: { select: () => chain([{ id: "owner-1" }]), insert: () => insert() },
}));
vi.mock("@/lib/notify", () => ({ sendIntakeNotification: vi.fn(async () => false) }));
vi.mock("@/lib/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/rate-limit")>()),
  hit: vi.fn(async () => true),
}));

import { hit } from "@/lib/rate-limit";
import { POST } from "./route";

const mockHit = vi.mocked(hit);

let ipSeq = 0;
const post = (body: Record<string, string>) =>
  POST(
    new Request("http://localhost/api/intake", {
      method: "POST",
      // A fresh IP per request so the per-IP limiter never interferes here.
      headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${++ipSeq}` },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  insert.mockClear();
  mockHit.mockClear();
  mockHit.mockResolvedValue(true);
  process.env.INTAKE_OWNER_EMAIL = "owner@test.local";
  process.env.INTAKE_KEY = "intake-key";
});

describe("POST /api/intake — INTAKE_KEY gate (K8)", () => {
  it("fails closed with 503 when INTAKE_KEY is unset, and writes nothing", async () => {
    delete process.env.INTAKE_KEY;
    const res = await post({ Problem: "slow claims", key: "" });
    expect(res.status).toBe(503);
    expect(insert).not.toHaveBeenCalled();
  });

  it("403 on a missing or wrong key, and writes nothing", async () => {
    expect((await post({ Problem: "slow claims" })).status).toBe(403);
    expect((await post({ Problem: "slow claims", key: "wrong" })).status).toBe(403);
    expect(insert).not.toHaveBeenCalled();
  });

  it("accepts the right key and persists one draft", async () => {
    const res = await post({ Problem: "slow claims", key: "intake-key" });
    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledOnce();
  });
});

describe("POST /api/intake — shared rate limit (K5)", () => {
  it("counts each submission against intake:<ip> in the shared limiter", async () => {
    await post({ Problem: "slow claims", key: "intake-key" });
    expect(mockHit).toHaveBeenCalledWith(expect.stringMatching(/^intake:10\.0\.0\.\d+$/), expect.objectContaining({ limit: 20 }));
  });

  it("429 with Retry-After when the limiter refuses, before any write", async () => {
    mockHit.mockResolvedValue(false);
    const res = await post({ Problem: "slow claims", key: "intake-key" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(insert).not.toHaveBeenCalled();
  });
});
