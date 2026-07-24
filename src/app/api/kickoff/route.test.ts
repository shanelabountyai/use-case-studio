import { describe, it, expect, vi, beforeEach } from "vitest";
import { CASE_POLICY_LOOKUP, CASE_THIN_PARK } from "@/lib/kickoff/fixtures";
import type { UseCase } from "@/lib/engine";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

let caseRows: unknown[] = [];
const chain = (rows: unknown[]) => {
  const p = Promise.resolve(rows) as Promise<unknown[]> & Record<string, unknown>;
  for (const m of ["from", "where", "values", "returning"]) p[m] = () => p;
  return p;
};
vi.mock("@/db", () => ({
  db: { select: () => chain(caseRows), insert: () => chain([{ id: "job-1" }]) },
}));
vi.mock("@/lib/kickoff/flags", () => ({
  kickoffEnabled: vi.fn(() => true),
  kickoffKilled: vi.fn(() => false),
}));

import { auth } from "@/auth";
import { kickoffEnabled } from "@/lib/kickoff/flags";
import { POST } from "./route";

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockEnabled = vi.mocked(kickoffEnabled);

const setCase = (uc: UseCase) => (caseRows = [{ payload: uc }]);
const req = (body: unknown) =>
  new Request("http://localhost/api/kickoff", { method: "POST", body: JSON.stringify(body) });

const scores = (n: number): UseCase["scores"] => ({
  value: n, feasibility: n, dataReadiness: n, risk: n, cost: n, timeToValue: n, fit: n,
});

beforeEach(() => {
  mockAuth.mockReset();
  mockAuth.mockResolvedValue({ user: { id: "user-a" } });
  mockEnabled.mockReturnValue(true);
  caseRows = [];
});

describe("POST /api/kickoff — gating", () => {
  it("503 when the feature is disabled", async () => {
    mockEnabled.mockReturnValue(false);
    expect((await POST(req({ caseId: "c" }))).status).toBe(503);
  });

  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await POST(req({ caseId: "c" }))).status).toBe(401);
  });

  it("400 when caseId is missing", async () => {
    expect((await POST(req({}))).status).toBe(400);
  });

  it("404 when the case isn't the caller's (owner-scoped query finds nothing)", async () => {
    caseRows = [];
    expect((await POST(req({ caseId: "c" }))).status).toBe(404);
  });
});

describe("POST /api/kickoff — pre-check & verdict routing", () => {
  it("422 with missing fields on a thin case, before any spend", async () => {
    setCase(CASE_THIN_PARK);
    const res = await POST(req({ caseId: "c" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.missing.map((m: { field: string }) => m.field)).toContain("acceptanceBar");
  });

  it("200 + PARK note (no job) for a complete PARK case", async () => {
    setCase({ ...CASE_POLICY_LOOKUP, scores: scores(1) }); // composite ~20 → PARK
    const res = await POST(req({ caseId: "c" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verdict).toBe("PARK");
    expect(body.note).toContain("no plan is generated");
    expect(body.jobId).toBeUndefined();
  });

  it("501 for a REFINE case (P1)", async () => {
    setCase({ ...CASE_POLICY_LOOKUP, scores: scores(3) }); // composite 60 → REFINE
    expect((await POST(req({ caseId: "c" }))).status).toBe(501);
  });

  it("202 + jobId for a clean BUILD case", async () => {
    setCase(CASE_POLICY_LOOKUP); // BUILD, internal (no PII gate)
    const res = await POST(req({ caseId: "c" }));
    expect(res.status).toBe(202);
    expect((await res.json()).jobId).toBe("job-1");
  });
});

describe("POST /api/kickoff — PII confirm gate", () => {
  it("409 for a BUILD+PII case without confirmation", async () => {
    setCase({ ...CASE_POLICY_LOOKUP, dataSensitivity: "pii" });
    const res = await POST(req({ caseId: "c" }));
    expect(res.status).toBe(409);
    expect((await res.json()).needs).toBe("confirmSendToProvider");
  });

  it("202 once confirmSendToProvider is set", async () => {
    setCase({ ...CASE_POLICY_LOOKUP, dataSensitivity: "pii" });
    const res = await POST(req({ caseId: "c", confirmSendToProvider: true }));
    expect(res.status).toBe(202);
  });
});
