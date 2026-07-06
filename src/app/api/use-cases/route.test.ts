import { describe, it, expect, vi, beforeEach } from "vitest";
import { blankCase } from "@/lib/engine";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
// A chainable stub whose terminal await resolves to the given rows.
const chain = (rows: unknown[]) => {
  const p = Promise.resolve(rows) as Promise<unknown[]> & Record<string, unknown>;
  for (const m of ["from", "where", "orderBy", "values", "set", "returning"]) p[m] = () => p;
  return p;
};
vi.mock("@/db", () => ({
  db: { select: () => chain([]), insert: () => chain([{ id: "row" }]) },
}));

import { auth } from "@/auth";
import { GET, POST } from "./route";

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);

beforeEach(() => mockAuth.mockReset());

describe("api/use-cases — unauthenticated", () => {
  beforeEach(() => mockAuth.mockResolvedValue(null));

  it("GET returns 401", async () => {
    expect((await GET()).status).toBe(401);
  });

  it("POST returns 401", async () => {
    const req = new Request("http://localhost/api/use-cases", { method: "POST", body: "{}" });
    expect((await POST(req)).status).toBe(401);
  });
});

describe("api/use-cases — authenticated validation", () => {
  beforeEach(() => mockAuth.mockResolvedValue({ user: { id: "user-a" } }));

  it("POST rejects structural garbage with 400 (does not reach the DB)", async () => {
    const req = new Request("http://localhost/api/use-cases", {
      method: "POST",
      body: JSON.stringify({ name: 123, scores: "nope" }),
    });
    expect((await POST(req)).status).toBe(400);
  });

  it("POST rejects a non-JSON body with 400", async () => {
    const req = new Request("http://localhost/api/use-cases", { method: "POST", body: "not json" });
    expect((await POST(req)).status).toBe(400);
  });

  it("POST accepts a well-formed payload", async () => {
    const req = new Request("http://localhost/api/use-cases", {
      method: "POST",
      body: JSON.stringify(blankCase()),
    });
    expect((await POST(req)).status).toBe(201);
  });
});
