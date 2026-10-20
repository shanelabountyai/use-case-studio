import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* POST /api/intake is the app's only UNAUTHENTICATED write. These tests pin
   its defensive layers: rate limit, body parsing, honeypot, minimum content,
   optional shared key, server-side owner resolution, and a server-computed
   verdict (the client never chooses whose Library it writes to, or the
   verdict it lands with). */

vi.mock("@/lib/notify", () => ({ sendIntakeNotification: vi.fn(async () => true) }));

// select(...) resolves to `ownerRows`; insert(...).values(v) records v.
let ownerRows: unknown[] = [];
const inserted: Record<string, unknown>[] = [];
const chain = (rows: unknown[]) => {
  const p = Promise.resolve(rows) as Promise<unknown[]> & Record<string, unknown>;
  for (const m of ["from", "where", "limit"]) p[m] = () => p;
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

import { sendIntakeNotification } from "@/lib/notify";
import { evaluate, type UseCase } from "@/lib/engine";
import { POST } from "./route";

const mockNotify = vi.mocked(sendIntakeNotification);
const OWNER_ID = "owner-user-id";

// Each test gets its own client IP so the module-level rate-limit table
// never bleeds between tests.
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

const good = { Problem: "Agents re-answer the same policy questions all day.", Company: "Acme" };

beforeEach(() => {
  ownerRows = [{ id: OWNER_ID }];
  inserted.length = 0;
  mockNotify.mockClear();
  process.env.INTAKE_OWNER_EMAIL = "owner@example.com";
  delete process.env.INTAKE_KEY;
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
    expect((await POST(jsonReq({ Problem: { a: 1 } }))).status).toBe(422);
    expect(inserted).toHaveLength(0);
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
    const res = await POST(jsonReq({ Problem: "   ", Company: "Acme" }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("missing_problem");
  });

  it("403 when INTAKE_KEY is configured and the key is wrong or missing", async () => {
    process.env.INTAKE_KEY = "k-123";
    expect((await POST(jsonReq({ ...good, key: "nope" }))).status).toBe(403);
    expect((await POST(jsonReq(good))).status).toBe(403);
    expect(inserted).toHaveLength(0);
  });

  it("accepts the right INTAKE_KEY", async () => {
    process.env.INTAKE_KEY = "k-123";
    expect((await POST(jsonReq({ ...good, key: "k-123" }))).status).toBe(200);
    expect(inserted).toHaveLength(1);
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
    process.env.INTAKE_KEY = "k-123";
    await POST(jsonReq({ ...good, key: "k-123" }));
    expect(JSON.stringify(inserted[0])).not.toContain("k-123");
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
