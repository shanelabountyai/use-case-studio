import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
// Configurable per test: the ownership `select` resolves to `ownedRows`.
let ownedRows: unknown[] = [];
const chain = (rows: unknown[]) => {
  const p = Promise.resolve(rows) as Promise<unknown[]> & Record<string, unknown>;
  for (const m of ["from", "where", "orderBy", "innerJoin", "values", "returning"]) p[m] = () => p;
  return p;
};
vi.mock("@/db", () => ({
  db: {
    select: () => chain(ownedRows),
    insert: () => chain([{ token: "tok", useCaseId: "uc-1", revoked: false }]),
  },
}));

import { auth } from "@/auth";
import { GET, POST } from "./route";

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const postReq = (body: unknown) =>
  new Request("http://localhost/api/share-links", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => { mockAuth.mockReset(); ownedRows = []; });

describe("api/share-links — unauthenticated", () => {
  beforeEach(() => mockAuth.mockResolvedValue(null));
  it("GET returns 401", async () => {
    expect((await GET(new Request("http://localhost/api/share-links"))).status).toBe(401);
  });
  it("POST returns 401", async () => {
    expect((await POST(postReq({ useCaseId: "uc-1" }))).status).toBe(401);
  });
});

describe("api/share-links — authenticated", () => {
  beforeEach(() => mockAuth.mockResolvedValue({ user: { id: "user-a" } }));

  it("POST without useCaseId returns 400", async () => {
    expect((await POST(postReq({}))).status).toBe(400);
  });

  it("POST for a case the caller doesn't own returns 404", async () => {
    ownedRows = []; // ownership query finds nothing
    expect((await POST(postReq({ useCaseId: "someone-elses" }))).status).toBe(404);
  });

  it("POST for an owned case mints a link (201)", async () => {
    ownedRows = [{ id: "uc-1" }]; // ownership query matches
    expect((await POST(postReq({ useCaseId: "uc-1" }))).status).toBe(201);
  });

  it("GET returns 200 with the caller's links", async () => {
    ownedRows = [{ token: "tok", useCaseId: "uc-1", revoked: false, createdAt: new Date() }];
    const res = await GET(new Request("http://localhost/api/share-links"));
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });
});
