import { describe, it, expect, vi, beforeEach } from "vitest";
import { CASE_POLICY_LOOKUP } from "@/lib/kickoff/fixtures";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/kickoff/worker", () => ({ getOwnedJob: vi.fn(), loadCasePayload: vi.fn() }));

import { auth } from "@/auth";
import { getOwnedJob, loadCasePayload } from "@/lib/kickoff/worker";
import { DECISION_SUPPORT_DISCLAIMER } from "@/lib/kickoff/export";
import { GET } from "./route";

/* The client-facing deliverable: it must be owner-scoped, gated on approval
   (P0.9), and take its client framing from the stored case — never from the
   request. */

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockGet = vi.mocked(getOwnedJob);
const mockLoad = vi.mocked(loadCasePayload);
const params = Promise.resolve({ jobId: "33333333-3333-4333-8333-333333333333" });
const call = (url = "http://localhost/x") => GET(new Request(url), { params });

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
  milestones: [{ phase: "P1", goal: "m", exitCriterion: "c" }],
  assumptions: [], refineGate: null,
};
const audit = {
  schemaVersion: "1", fabricationScan: [], consistencyIssues: [], verdictIntegrity: { pass: true, note: "" },
  gaps: [], acceptanceBarSpine: { isSpine: true, evidence: "" }, overclaims: [],
  verdict: "SHIP AS-IS", topFixes: [],
};
const provenance = { caseVersion: "v", promptRosterVersion: "p", model: "stub", modelParams: {}, verdictAtGeneration: "BUILD", engineOutputsHash: "h" };
const job = (status: string) => ({ status, plan, audit, provenance, version: 2, caseId: "case-1" }) as never;

beforeEach(() => {
  mockAuth.mockReset();
  mockGet.mockReset();
  mockLoad.mockReset();
  mockAuth.mockResolvedValue({ user: { id: "user-a" } });
  mockLoad.mockResolvedValue({ ...CASE_POLICY_LOOKUP, engagement: { client: "Acme Corp" } } as never);
});

describe("GET /api/kickoff/:jobId/package.md", () => {
  it("401 when unauthenticated, without looking the job up", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("looks the job up scoped to the session user", async () => {
    mockGet.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(mockGet).toHaveBeenCalledWith("33333333-3333-4333-8333-333333333333", "user-a");
  });

  it.each(["queued", "running", "partial", "failed", "complete"])("403 while the plan is %s (not approved)", async (s) => {
    mockGet.mockResolvedValue(job(s));
    expect((await call()).status).toBe(403);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it("404 when the approved job's case is gone", async () => {
    mockGet.mockResolvedValue(job("approved"));
    mockLoad.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("200 markdown attachment with the disclaimer and the stored client name", async () => {
    mockGet.mockResolvedValue(job("approved"));
    // A spoofed query param must not change who the package is prepared for.
    const res = await call("http://localhost/x?client=Evil%20Inc");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const body = await res.text();
    expect(body).toContain(DECISION_SUPPORT_DISCLAIMER);
    expect(body).toContain("**Prepared for:** Acme Corp");
    expect(body).not.toContain("Evil Inc");
    expect(body).toContain("Plan version:** v2");
  });
});
