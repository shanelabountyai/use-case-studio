import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/kickoff/worker", () => ({ approveJob: vi.fn() }));

import { auth } from "@/auth";
import { approveJob } from "@/lib/kickoff/worker";
import { POST } from "./route";

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockApprove = vi.mocked(approveJob);
const params = Promise.resolve({ jobId: "job-1" });
const call = () => POST(new Request("http://localhost/x", { method: "POST" }), { params });

beforeEach(() => {
  mockAuth.mockReset();
  mockApprove.mockReset();
  mockAuth.mockResolvedValue({ user: { id: "user-a" } });
});

describe("POST /api/kickoff/:jobId/approve", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it("404 when the job isn't the caller's", async () => {
    mockApprove.mockResolvedValue("not-found");
    expect((await call()).status).toBe(404);
  });

  it("409 when the plan is not approvable (partial/incomplete)", async () => {
    mockApprove.mockResolvedValue("not-approvable");
    expect((await call()).status).toBe(409);
  });

  it("200 when a completed plan is approved", async () => {
    mockApprove.mockResolvedValue("approved");
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("approved");
  });
});
