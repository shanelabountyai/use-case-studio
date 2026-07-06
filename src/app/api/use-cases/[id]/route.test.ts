import { describe, it, expect, vi, beforeEach } from "vitest";
import { blankCase } from "@/lib/engine";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
// A chainable stub whose terminal await resolves to [] — i.e. the owner-scoped
// query (id AND user_id) matched no row. This is exactly what a non-owner sees.
const emptyChain = () => {
  const p = Promise.resolve([]) as Promise<unknown[]> & Record<string, unknown>;
  for (const m of ["from", "where", "set", "returning", "innerJoin"]) p[m] = () => p;
  return p;
};
vi.mock("@/db", () => ({
  db: { select: () => emptyChain(), update: () => emptyChain(), delete: () => emptyChain() },
}));

import { auth } from "@/auth";
import { GET, PUT, DELETE } from "./route";

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const params = Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" });

beforeEach(() => mockAuth.mockReset());

describe("api/use-cases/[id] — unauthenticated", () => {
  beforeEach(() => mockAuth.mockResolvedValue(null));

  it("GET returns 401", async () => {
    expect((await GET(new Request("http://localhost/x"), { params })).status).toBe(401);
  });
  it("PUT returns 401", async () => {
    const req = new Request("http://localhost/x", { method: "PUT", body: "{}" });
    expect((await PUT(req, { params })).status).toBe(401);
  });
  it("DELETE returns 401", async () => {
    expect((await DELETE(new Request("http://localhost/x"), { params })).status).toBe(401);
  });
});

describe("api/use-cases/[id] — authenticated non-owner (scoped query finds nothing)", () => {
  beforeEach(() => mockAuth.mockResolvedValue({ user: { id: "not-the-owner" } }));

  it("GET returns 404", async () => {
    expect((await GET(new Request("http://localhost/x"), { params })).status).toBe(404);
  });
  it("PUT returns 404 (valid body, but the row isn't theirs)", async () => {
    const req = new Request("http://localhost/x", { method: "PUT", body: JSON.stringify(blankCase()) });
    expect((await PUT(req, { params })).status).toBe(404);
  });
  it("DELETE returns 404", async () => {
    expect((await DELETE(new Request("http://localhost/x"), { params })).status).toBe(404);
  });
});
