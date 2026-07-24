import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
let rows: unknown[] = [];
const chain = (r: unknown[]) => {
  const p = Promise.resolve(r) as Promise<unknown[]> & Record<string, unknown>;
  for (const m of ["from", "where"]) p[m] = () => p;
  return p;
};
vi.mock("@/db", () => ({ db: { select: () => chain(rows) } }));

import { auth } from "@/auth";
import { GET } from "./route";

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const params = Promise.resolve({ jobId: "job-1" });

beforeEach(() => {
  mockAuth.mockReset();
  rows = [];
});

describe("GET /api/kickoff/:jobId", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/x"), { params })).status).toBe(401);
  });

  it("404 for a non-owner (scoped query finds nothing)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "not-owner" } });
    rows = [];
    expect((await GET(new Request("http://localhost/x"), { params })).status).toBe(404);
  });

  it("returns status + result for the owner", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-a" } });
    rows = [{ id: "job-1", status: "complete", plan: { schemaVersion: "1" }, audit: {}, laneStatus: { planner: "ok" }, cost: null, note: null, createdAt: new Date() }];
    const res = await GET(new Request("http://localhost/x"), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("complete");
  });
});
