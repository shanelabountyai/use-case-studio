import { describe, it, expect, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock("@/db", () => ({ db: {} }));

import { GET, PUT, DELETE } from "./route";

const params = Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" });

describe("api/use-cases/[id] — unauthenticated", () => {
  it("GET returns 401", async () => {
    const res = await GET(new Request("http://localhost/api/use-cases/x"), { params });
    expect(res.status).toBe(401);
  });

  it("PUT returns 401", async () => {
    const req = new Request("http://localhost/api/use-cases/x", {
      method: "PUT",
      body: JSON.stringify({}),
    });
    const res = await PUT(req, { params });
    expect(res.status).toBe(401);
  });

  it("DELETE returns 401", async () => {
    const res = await DELETE(new Request("http://localhost/api/use-cases/x"), { params });
    expect(res.status).toBe(401);
  });
});
