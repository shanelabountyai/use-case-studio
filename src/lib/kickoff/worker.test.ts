import { describe, it, expect, vi, beforeEach } from "vitest";

// worker.ts imports @/db at module load (neon client) — mock it. select/update
// rows are settable per-test for the CAS-claim cases; executeJob touches no DB.
let selectRows: unknown[] = [];
let updateRows: unknown[] = [];
// Chainable stub whose terminal await (and .returning()) resolve to `rows`.
const chain = (rows: unknown[]) => {
  const p = Promise.resolve(rows) as Promise<unknown[]> & Record<string, unknown>;
  for (const m of ["from", "where", "orderBy", "limit", "values", "set", "returning"]) p[m] = () => p;
  return p;
};
vi.mock("@/db", () => ({
  db: {
    select: () => chain(selectRows),
    update: () => chain(updateRows),
    insert: () => chain([{ id: "job-1" }]),
  },
}));

import { executeJob, claimNextJob, createJob, approveJob, recordFeedback } from "./worker";
import { stubPlanner, stubCritic } from "./provider";
import { CASE_POLICY_LOOKUP } from "./fixtures";

const CASE_ID = "22222222-2222-4222-8222-222222222222";
const LIMITS = { tokenCap: 60000, timeoutMs: 120000, maxConcurrent: 1, dailyCeiling: 20 };

beforeEach(() => {
  selectRows = [];
  updateRows = [];
});

describe("executeJob — state machine (LLM stages injected)", () => {
  it("happy path: both lanes ok → complete with plan + audit", async () => {
    const out = await executeJob(CASE_ID, CASE_POLICY_LOOKUP, "BUILD", {
      planner: stubPlanner,
      critic: stubCritic,
    });
    expect(out.status).toBe("complete");
    expect(out.plan).not.toBeNull();
    expect(out.audit).not.toBeNull();
    expect(out.laneStatus).toEqual({ planner: "ok", critic: "ok" });
  });

  it("planner failure → partial, planner lane failed, critic never called", async () => {
    const critic = vi.fn();
    const out = await executeJob(CASE_ID, CASE_POLICY_LOOKUP, "BUILD", {
      planner: async () => {
        throw new Error("boom");
      },
      critic,
    });
    expect(out.status).toBe("partial");
    expect(out.laneStatus.planner).toBe("failed");
    expect(out.audit).toBeNull();
    expect(critic).not.toHaveBeenCalled();
  });

  it("critic failure → partial, plan kept but non-approvable (no audit)", async () => {
    const out = await executeJob(CASE_ID, CASE_POLICY_LOOKUP, "BUILD", {
      planner: stubPlanner,
      critic: async () => {
        throw new Error("boom");
      },
    });
    expect(out.status).toBe("partial");
    expect(out.plan).not.toBeNull();
    expect(out.audit).toBeNull();
    expect(out.laneStatus.critic).toBe("failed");
  });

  it("verdict mismatch (planner echoes wrong verdict) → partial", async () => {
    const out = await executeJob(CASE_ID, CASE_POLICY_LOOKUP, "BUILD", {
      planner: async (g) => {
        const { plan, ...rest } = await stubPlanner(g);
        return { ...rest, plan: { ...plan, verdict: "REFINE" as const, refineGate: { conditions: ["x"], noGoConditions: ["y"] } } };
      },
      critic: stubCritic,
    });
    expect(out.status).toBe("partial");
    expect(out.laneStatus.planner).toBe("failed");
    expect(out.note).toMatch(/verdict mismatch/);
  });

  it("token cap breach after the planner → partial, critic skipped, no runaway", async () => {
    const critic = vi.fn();
    const out = await executeJob(
      CASE_ID, CASE_POLICY_LOOKUP, "BUILD",
      { planner: async (g) => ({ ...(await stubPlanner(g)), inputTokens: 999_999, outputTokens: 0 }), critic },
      { ...LIMITS, tokenCap: 100 },
    );
    expect(out.status).toBe("partial");
    expect(out.note).toMatch(/token cap exceeded/);
    expect(out.laneStatus.critic).toBe("skipped");
    expect(critic).not.toHaveBeenCalled();
  });

  it("wall-clock timeout → partial with a labeled timeout note", async () => {
    const out = await executeJob(
      CASE_ID, CASE_POLICY_LOOKUP, "BUILD",
      { planner: async (g) => { await new Promise((r) => setTimeout(r, 40)); return stubPlanner(g); }, critic: stubCritic },
      { ...LIMITS, timeoutMs: 5 },
    );
    expect(out.status).toBe("partial");
    expect(out.note).toMatch(/timeout/);
  });
});

describe("recordFeedback", () => {
  it("persists a signal on a job the caller owns", async () => {
    selectRows = [{ id: "j", userId: "user-a" }];
    expect(await recordFeedback({ jobId: "j", userId: "user-a", kind: "usable", value: "yes" })).toBe(true);
  });

  it("refuses to write on a job the caller doesn't own", async () => {
    selectRows = [];
    expect(await recordFeedback({ jobId: "j", userId: "not-owner", kind: "gap-real", value: "no" })).toBe(false);
  });
});

describe("claimNextJob — compare-and-swap", () => {
  it("returns null when the queue is empty", async () => {
    selectRows = [];
    expect(await claimNextJob()).toBeNull();
  });

  it("claims a queued job when the guarded update wins", async () => {
    selectRows = [{ id: "c", attempts: 0 }];
    updateRows = [{ id: "c", status: "running", caseId: "case-1" }];
    const row = await claimNextJob();
    expect(row?.id).toBe("c");
  });

  it("returns null when another worker won the race (guarded update matched nothing)", async () => {
    selectRows = [{ id: "c", attempts: 0 }];
    updateRows = [];
    expect(await claimNextJob()).toBeNull();
  });

  it("fails a job past the attempt cap instead of re-running it", async () => {
    selectRows = [{ id: "c", attempts: 3 }];
    expect(await claimNextJob()).toBeNull(); // marked failed, not claimed
  });
});

describe("createJob", () => {
  it("inserts a queued row and returns its id", async () => {
    const job = await createJob({
      caseId: "case-1",
      userId: "user-a",
      provenance: {
        caseVersion: "v", promptRosterVersion: "p", model: "stub", modelParams: {},
        verdictAtGeneration: "BUILD", engineOutputsHash: "h",
      },
    });
    expect(job.id).toBe("job-1");
  });
});

describe("approveJob — draft→approve gate", () => {
  it("approves a completed plan", async () => {
    selectRows = [{ id: "j", status: "complete", userId: "user-a" }];
    expect(await approveJob("j", "user-a")).toBe("approved");
  });

  it("refuses a partial plan (non-approvable)", async () => {
    selectRows = [{ id: "j", status: "partial", userId: "user-a" }];
    expect(await approveJob("j", "user-a")).toBe("not-approvable");
  });

  it("refuses a queued plan (non-approvable)", async () => {
    selectRows = [{ id: "j", status: "queued", userId: "user-a" }];
    expect(await approveJob("j", "user-a")).toBe("not-approvable");
  });

  it("returns not-found for a non-owner (scoped query finds nothing)", async () => {
    selectRows = [];
    expect(await approveJob("j", "not-owner")).toBe("not-found");
  });
});
