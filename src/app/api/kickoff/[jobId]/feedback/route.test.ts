import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/kickoff/worker", () => ({ recordFeedback: vi.fn() }));

import { auth } from "@/auth";
import { recordFeedback } from "@/lib/kickoff/worker";
import { POST } from "./route";

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockRecord = vi.mocked(recordFeedback);
const params = Promise.resolve({ jobId: "job-1" });
const post = (body: unknown) =>
  POST(new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) }), { params });

beforeEach(() => {
  mockAuth.mockReset();
  mockRecord.mockReset();
  mockAuth.mockResolvedValue({ user: { id: "user-a" } });
  mockRecord.mockResolvedValue(true);
});

describe("POST /api/kickoff/:jobId/feedback", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await post({ kind: "usable", value: "yes" })).status).toBe(401);
  });

  it("400 on an unknown kind", async () => {
    expect((await post({ kind: "nonsense", value: "x" })).status).toBe(400);
  });

  it("400 when value is missing", async () => {
    expect((await post({ kind: "usable" })).status).toBe(400);
  });

  it("404 when the job isn't the caller's", async () => {
    mockRecord.mockResolvedValue(false);
    expect((await post({ kind: "fabrication", ref: "99.9%", value: "flagged" })).status).toBe(404);
  });

  it("200 on a valid owner-scoped signal", async () => {
    const res = await post({ kind: "gap-real", ref: "ACL plumbing", value: "yes" });
    expect(res.status).toBe(200);
    expect(mockRecord).toHaveBeenCalledOnce();
  });
});
