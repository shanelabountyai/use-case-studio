import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* POST /api/intake is the app's only UNAUTHENTICATED write. These tests pin
   its defensive layers: shared rate limit (K5), body parsing, honeypot,
   minimum content, the fail-closed INTAKE_KEY gate (K8), server-side owner
   resolution, and a server-computed verdict (the client never chooses whose
   Library it writes to, or the verdict it lands with). */

vi.mock("@/lib/notify", () => ({ sendIntakeNotification: vi.fn(async () => true) }));

// select(...) resolves to `ownerRows`; insert(...).values(v) records v.
let ownerRows: unknown[] = [];
const inserted: Record<string, unknown>[] = [];
const chain = (rows: unknown[]) => {
  const p = Promise.resolve(rows) as Promise<unknown[]> & Record<string, unknown>;
  for (const m of ["from", "where", "limit", "values", "set", "returning"]) p[m] = () => p;
  return p;
};
vi.mock("@/db", () => ({
  db: {
    select: () => chain(ownerRows),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted.push(v);
        return Promise.resolve([]);
      },
    }),
  },
}));

// The shared limiter is DB-backed (src/lib/rate-limit.ts, covered by its own
// unit + integration tests). Here `hit` is replaced by an in-memory stand-in
// with the same contract: true while a key's count is within `limit`.
vi.mock("@/lib/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/rate-limit")>()),
  hit: vi.fn(async () => true),
}));

import { sendIntakeNotification } from "@/lib/notify";
import { hit, type Limit } from "@/lib/rate-limit";
import { evaluate, type UseCase } from "@/lib/engine";
import { POST } from "./route";

const mockNotify = vi.mocked(sendIntakeNotification);
const mockHit = vi.mocked(hit);
const OWNER_ID = "owner-user-id";
const KEY = "intake-key";

const counts = new Map<string, number>();
const inMemoryHit = async (key: string, { limit }: Limit) => {
  const n = (counts.get(key) ?? 0) + 1;
  counts.set(key, n);
  return n <= limit;
};

// Each test gets its own client IP so limiter counts never bleed between tests.
let ipSeq = 0;
const nextIp = () => `10.0.0.${++ipSeq}`;

const jsonReq = (body: unknown, ip = nextIp()) =>
  new Request("http://localhost/api/intake", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const formReq = (fields: Record<string, string>, ip = nextIp()) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new Request("http://localhost/api/intake", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: fd,
  });
};

const post = (body: Record<string, string>) => POST(jsonReq(body));

const base = { Problem: "Agents re-answer the same policy questions all day.", Company: "Acme" };
const good = { ...base, key: KEY };

beforeEach(() => {
  ownerRows = [{ id: OWNER_ID }];
  inserted.length = 0;
  counts.clear();
  mockNotify.mockClear();
  mockHit.mockReset();
  mockHit.mockImplementation(inMemoryHit);
  process.env.INTAKE_OWNER_EMAIL = "owner@example.com";
  process.env.INTAKE_KEY = KEY;
});

afterEach(() => {
  delete process.env.INTAKE_OWNER_EMAIL;
  delete process.env.INTAKE_KEY;
});

describe("POST /api/intake — body parsing", () => {
  it("400 on malformed JSON", async () => {
    expect((await POST(jsonReq("{not json"))).status).toBe(400);
    expect(inserted).toHaveLength(0);
  });

  it("400 (not a 500) on a JSON null body", async () => {
    expect((await POST(jsonReq("null"))).status).toBe(400);
  });

  it("400 on a JSON array body", async () => {
    expect((await POST(jsonReq([good]))).status).toBe(400);
  });

  it("ignores non-string JSON values instead of stringifying them into the case", async () => {
    const res = await POST(jsonReq({ ...good, Users: { $ne: 1 }, Budget: 123 }));
    expect(res.status).toBe(200);
    const payload = inserted[0].payload as Record<string, unknown>;
    expect(payload.users).toBe("");
    expect(payload.budget).toBe("");
  });

  it("a non-string Problem counts as missing (422), never '[object Object]'", async () => {
    expect((await POST(jsonReq({ Problem: { a: 1 }, key: KEY }))).status).toBe(422);
    expect(inserted).toHaveLength(0);
  });

  it("a non-string key is refused (403), never coerced", async () => {
    expect((await POST(jsonReq({ ...base, key: [KEY] }))).status).toBe(403);
    expect(inserted).toHaveLength(0);
  });
});

describe("POST /api/intake — INTAKE_KEY gate (K8)", () => {
  it("fails closed with 503 when INTAKE_KEY is unset, and writes nothing", async () => {
    delete process.env.INTAKE_KEY;
    const res = await post({ Problem: "slow claims", key: "" });
    expect(res.status).toBe(503);
    expect(inserted).toHaveLength(0);
  });

  it("403 on a missing or wrong key, and writes nothing", async () => {
    expect((await post({ Problem: "slow claims" })).status).toBe(403);
    expect((await post({ Problem: "slow claims", key: "wrong" })).status).toBe(403);
    expect((await post({ ...base, key: "nope" })).status).toBe(403);
    expect((await post(base)).status).toBe(403);
    expect(inserted).toHaveLength(0);
  });

  it("accepts the right key and persists one draft", async () => {
    const res = await post({ Problem: "slow claims", key: KEY });
    expect(res.status).toBe(200);
    expect(inserted).toHaveLength(1);
  });
});

describe("POST /api/intake — gates", () => {
  it("honeypot: answers 200 but persists nothing and sends no email", async () => {
    const res = await POST(jsonReq({ ...good, botcheck: "on" }));
    expect(res.status).toBe(200);
    expect(inserted).toHaveLength(0);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("422 when the problem statement is blank", async () => {
    const res = await POST(jsonReq({ Problem: "   ", Company: "Acme", key: KEY }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("missing_problem");
  });

  it("503 when no owner is configured", async () => {
    delete process.env.INTAKE_OWNER_EMAIL;
    expect((await POST(jsonReq(good))).status).toBe(503);
    expect(inserted).toHaveLength(0);
  });

  it("503 when the configured owner has no account", async () => {
    ownerRows = [];
    expect((await POST(jsonReq(good))).status).toBe(503);
    expect(inserted).toHaveLength(0);
  });
});

describe("POST /api/intake — shared rate limit (K5)", () => {
  it("counts each submission against intake:<ip> in the shared limiter", async () => {
    await post(good);
    expect(mockHit).toHaveBeenCalledWith(expect.stringMatching(/^intake:10\.0\.0\.\d+$/), expect.objectContaining({ limit: 20 }));
  });

  it("429 with Retry-After when the limiter refuses, before any write", async () => {
    mockHit.mockResolvedValue(false);
    const res = await post(good);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(inserted).toHaveLength(0);
  });

  it("429 once one IP exceeds the per-window cap", async () => {
    const ip = nextIp();
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await POST(jsonReq({ Problem: "" }, ip))).status;
    expect(last).toBe(429);
  });
});

describe("POST /api/intake — persistence", () => {
  it("writes a draft owned by the configured owner, whatever the client claims", async () => {
    const res = await POST(jsonReq({ ...good, userId: "attacker", user_id: "attacker" }));
    expect(res.status).toBe(200);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].userId).toBe(OWNER_ID);
  });

  it("computes the verdict server-side; a client-sent verdict/composite is ignored", async () => {
    await POST(jsonReq({ ...good, verdict: "BUILD", composite: "100" }));
    const row = inserted[0];
    const payload = row.payload as Record<string, unknown>;
    // Denormalized columns are exactly the engine's output over the stored payload.
    const ev = evaluate(payload as unknown as UseCase);
    expect(row.verdict).toBe(ev.verdict);
    expect(row.composite).toBe(Math.round(ev.composite));
    expect(row.composite).not.toBe(100);
    expect(payload.verdict).toBeUndefined(); // not carried onto the payload either
    expect(payload.source).toBe("intake");
    expect(payload.name).toBe("Intake — Acme");
  });

  it("never persists the shared intake key into the payload", async () => {
    await POST(jsonReq(good));
    expect(JSON.stringify(inserted[0])).not.toContain(KEY);
  });

  it("accepts the discovery form's multipart body and notifies the owner", async () => {
    const res = await POST(formReq(good));
    expect(res.status).toBe(200);
    expect(inserted).toHaveLength(1);
    expect(mockNotify).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({ source: "intake" }));
  });

  it("a failed notification never fails a persisted submission", async () => {
    mockNotify.mockResolvedValueOnce(false);
    expect((await POST(jsonReq(good))).status).toBe(200);
    expect(inserted).toHaveLength(1);
  });
});
