import { describe, it, expect, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock("@/db", () => ({ db: {} }));

import { GET, POST } from "./route";

describe("api/use-cases — unauthenticated", () => {
  it("GET returns 401", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("POST returns 401", async () => {
    const req = new Request("http://localhost/api/use-cases", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
