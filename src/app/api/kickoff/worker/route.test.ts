import { describe, it, expect, vi, beforeEach } from "vitest";
import { CASE_POLICY_LOOKUP } from "@/lib/kickoff/fixtures";

vi.mock("@/lib/kickoff/flags", () => ({
  kickoffKilled: vi.fn(() => false),
  kickoffEnabled: vi.fn(() => false), // stub path — executeJob is mocked anyway
}));
// Pretend the real Claude stages were selected, so the provenance stamp under
// test is a real model id rather than the same "stub" the row already carried.
vi.mock("@/lib/kickoff/provider", () => ({
  getProvider: vi.fn(() => ({ planner: vi.fn(), critic: vi.fn(), model: "claude-opus-5" })),
}));
vi.mock("@/lib/kickoff/worker", () => ({
  claimNextJob: vi.fn(),
  executeJob: vi.fn(),
  finishJob: vi.fn(async () => {}),
  failInflightJobs: vi.fn(async () => {}),
  loadCasePayload: vi.fn(),
}));

import { kickoffKilled } from "@/lib/kickoff/flags";
import { claimNextJob, executeJob, finishJob, failInflightJobs, loadCasePayload } from "@/lib/kickoff/worker";
import { KICKOFF_EFFORT } from "@/lib/kickoff/claude";
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

  /* The enqueue-time provenance is always model:"stub" — a placeholder written
     before anything runs. If the worker doesn't overwrite it, every exported
     plan claims a stub produced it even when claude-opus-5 did. */
  it("stamps the model that actually ran onto provenance", async () => {
    const enqueued = { caseVersion: "v1", promptRosterVersion: "r1", model: "stub", modelParams: {}, verdictAtGeneration: "BUILD", engineOutputsHash: "h1" };
    mockClaim.mockResolvedValue({ id: "job-1", caseId: "case-1", provenance: enqueued } as never);
    mockLoad.mockResolvedValue(CASE_POLICY_LOOKUP);
    mockExecute.mockResolvedValue({ status: "complete", plan: null, audit: null, laneStatus: {}, cost: null, note: null });

    await GET(withSecret());

    const stamped = vi.mocked(finishJob).mock.calls[0][3];
    expect(stamped?.model).toBe("claude-opus-5"); // not the enqueued "stub"
    expect(stamped?.modelParams).toEqual({ effort: KICKOFF_EFFORT });
    expect(stamped?.caseVersion).toBe("v1"); // the rest of the row survives
  });

  it("marks the job failed when its case vanished", async () => {
    mockClaim.mockResolvedValue({ id: "job-1", caseId: "case-1" } as never);
    mockLoad.mockResolvedValue(null);
    const res = await GET(withSecret());
    expect((await res.json()).status).toBe("failed");
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
