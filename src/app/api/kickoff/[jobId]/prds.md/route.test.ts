import { describe, it, expect, vi, beforeEach } from "vitest";
import { CASE_POLICY_LOOKUP } from "@/lib/kickoff/fixtures";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/kickoff/worker", () => ({ getOwnedJob: vi.fn(), loadCasePayload: vi.fn() }));

import { auth } from "@/auth";
import { getOwnedJob, loadCasePayload } from "@/lib/kickoff/worker";
import { GET } from "./route";

/* The PRD pack is a build-team working document: owner-scoped, gated on a plan
   existing (not on approval), and honest when no critic audit is attached. */

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockGet = vi.mocked(getOwnedJob);
const mockLoad = vi.mocked(loadCasePayload);
const params = Promise.resolve({ jobId: "33333333-3333-4333-8333-333333333333" });
const call = () => GET(new Request("http://localhost/x"), { params });

const plan = {
  schemaVersion: "1", verdict: "BUILD", taskShape: "lookup", architecturePattern: "RAG",
  executiveSummary: "Exec summary text.",
  sections: {
    architecture: { heading: "Architecture", markdown: "a" },
    dataPipeline: { heading: "Data", markdown: "d" },
    evaluation: { heading: "Eval", markdown: "e" },
    governance: { heading: "Gov", markdown: "g" },
    delivery: { heading: "Delivery", markdown: "x" },
  },
  dataFlows: [{ name: "f", steps: ["a"] }],
  milestones: [{ phase: "P1", goal: "Stand up retrieval", exitCriterion: "c" }],
  assumptions: [], refineGate: null,
};
const provenance = { caseVersion: "v", promptRosterVersion: "p", model: "stub", modelParams: {}, verdictAtGeneration: "BUILD", engineOutputsHash: "h" };

beforeEach(() => {
  mockAuth.mockReset();
  mockGet.mockReset();
  mockLoad.mockReset();
  mockAuth.mockResolvedValue({ user: { id: "user-a" } });
  mockLoad.mockResolvedValue(CASE_POLICY_LOOKUP);
});

describe("GET /api/kickoff/:jobId/prds.md", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("404 when the job isn't the caller's", async () => {
    mockGet.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(mockGet).toHaveBeenCalledWith("33333333-3333-4333-8333-333333333333", "user-a");
  });

  it("409 when the run produced no plan", async () => {
    mockGet.mockResolvedValue({ status: "failed", plan: null, audit: null, provenance, version: 1, caseId: "c" } as never);
    expect((await call()).status).toBe(409);
  });

  it("404 when the case is gone", async () => {
    mockGet.mockResolvedValue({ status: "complete", plan, audit: null, provenance, version: 1, caseId: "c" } as never);
    mockLoad.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("200 for a partial run (no approval needed) and says the plan was not audited", async () => {
    mockGet.mockResolvedValue({ status: "partial", plan, audit: null, provenance, version: 1, caseId: "c" } as never);
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("content-disposition")).toContain("prd-pack.md");
    const body = await res.text();
    expect(body).toContain("NO INDEPENDENT AUDIT");
    expect(body).toContain("Stand up retrieval");
  });
});
