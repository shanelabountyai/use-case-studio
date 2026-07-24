import { describe, it, expect, vi, beforeEach } from "vitest";
import { CASE_POLICY_LOOKUP } from "@/lib/kickoff/fixtures";

vi.mock("@/lib/kickoff/flags", () => ({ kickoffKilled: vi.fn(() => false) }));
vi.mock("@/lib/kickoff/worker", () => ({
  claimNextJob: vi.fn(),
  executeJob: vi.fn(),
  finishJob: vi.fn(async () => {}),
  failInflightJobs: vi.fn(async () => {}),
  loadCasePayload: vi.fn(),
}));

import { kickoffKilled } from "@/lib/kickoff/flags";
import { claimNextJob, executeJob, finishJob, failInflightJobs, loadCasePayload } from "@/lib/kickoff/worker";
import { GET } from "./route";

const mockKilled = vi.mocked(kickoffKilled);
const mockClaim = vi.mocked(claimNextJob);
const mockExecute = vi.mocked(executeJob);
const mockLoad = vi.mocked(loadCasePayload);

const withSecret = () =>
  new Request("http://localhost/api/kickoff/worker", { headers: { authorization: "Bearer s3cr3t" } });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cr3t";
  mockKilled.mockReturnValue(false);
});

describe("GET /api/kickoff/worker — cron auth", () => {
  it("401 without the CRON_SECRET bearer token", async () => {
    expect((await GET(new Request("http://localhost/api/kickoff/worker"))).status).toBe(401);
  });

  it("401 when CRON_SECRET is unset (fail closed)", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(withSecret())).status).toBe(401);
  });
});

describe("GET /api/kickoff/worker — drain", () => {
  it("kill switch → fails in-flight and reports paused, claims nothing", async () => {
    mockKilled.mockReturnValue(true);
    const res = await GET(withSecret());
    expect((await res.json()).paused).toBe(true);
    expect(failInflightJobs).toHaveBeenCalledOnce();
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("empty queue → claimed: 0", async () => {
    mockClaim.mockResolvedValue(null);
    expect((await (await GET(withSecret())).json()).claimed).toBe(0);
  });

  it("claims a job, runs it, and persists the terminal status", async () => {
    mockClaim.mockResolvedValue({ id: "job-1", caseId: "case-1" } as never);
    mockLoad.mockResolvedValue(CASE_POLICY_LOOKUP);
    mockExecute.mockResolvedValue({ status: "complete", plan: null, audit: null, laneStatus: {}, cost: null, note: null });
    const res = await GET(withSecret());
    expect((await res.json()).status).toBe("complete");
    expect(finishJob).toHaveBeenCalledOnce();
  });

  it("marks the job failed when its case vanished", async () => {
    mockClaim.mockResolvedValue({ id: "job-1", caseId: "case-1" } as never);
    mockLoad.mockResolvedValue(null);
    const res = await GET(withSecret());
    expect((await res.json()).status).toBe("failed");
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
