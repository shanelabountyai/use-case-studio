import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
let ownedRows: unknown[] = [];
const chain = (rows: unknown[]) => {
  const p = Promise.resolve(rows) as Promise<unknown[]> & Record<string, unknown>;
  for (const m of ["from", "where", "innerJoin", "set"]) p[m] = () => p;
  return p;
};
vi.mock("@/db", () => ({
  db: { select: () => chain(ownedRows), update: () => chain([]) },
}));

import { auth } from "@/auth";
import { DELETE } from "./route";

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const params = Promise.resolve({ token: "tok-123" });

beforeEach(() => { mockAuth.mockReset(); ownedRows = []; });

describe("api/share-links/[token] DELETE (revoke)", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await DELETE(new Request("http://localhost/x"), { params })).status).toBe(401);
  });

  it("returns 404 when the link isn't owned by the caller", async () => {
    mockAuth.mockResolvedValue({ user: { id: "not-owner" } });
    ownedRows = []; // join filtered by user_id finds nothing
    expect((await DELETE(new Request("http://localhost/x"), { params })).status).toBe(404);
  });

  it("revokes and returns 200 when owned", async () => {
    mockAuth.mockResolvedValue({ user: { id: "owner" } });
    ownedRows = [{ token: "tok-123" }];
    expect((await DELETE(new Request("http://localhost/x"), { params })).status).toBe(200);
  });
});
