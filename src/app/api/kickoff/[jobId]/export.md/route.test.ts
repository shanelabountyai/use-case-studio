import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/kickoff/worker", () => ({ getOwnedJob: vi.fn() }));

import { auth } from "@/auth";
import { getOwnedJob } from "@/lib/kickoff/worker";
import { DECISION_SUPPORT_DISCLAIMER } from "@/lib/kickoff/export";
import { GET } from "./route";

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockGet = vi.mocked(getOwnedJob);
const params = Promise.resolve({ jobId: "job-1" });
const call = () => GET(new Request("http://localhost/x"), { params });

const plan = {
  schemaVersion: "1", verdict: "BUILD", taskShape: "lookup", architecturePattern: "RAG",
  executiveSummary: "s",
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
  gaps: [{ title: "g", detail: "d" }], acceptanceBarSpine: { isSpine: true, evidence: "" }, overclaims: [],
  verdict: "SHIP AS-IS", topFixes: [],
};
const provenance = { caseVersion: "v", promptRosterVersion: "p", model: "stub", modelParams: {}, verdictAtGeneration: "BUILD", engineOutputsHash: "h" };

beforeEach(() => {
  mockAuth.mockReset();
  mockGet.mockReset();
  mockAuth.mockResolvedValue({ user: { id: "user-a" } });
});

describe("GET /api/kickoff/:jobId/export.md", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it("404 when the job isn't the caller's", async () => {
    mockGet.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("403 when the plan is not yet approved", async () => {
    mockGet.mockResolvedValue({ status: "complete", plan, audit, provenance, version: 1 } as never);
    expect((await call()).status).toBe(403);
  });

  it("200 markdown with the disclaimer + audit once approved", async () => {
    mockGet.mockResolvedValue({ status: "approved", plan, audit, provenance, version: 1 } as never);
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const body = await res.text();
    expect(body).toContain(DECISION_SUPPORT_DISCLAIMER);
    expect(body).toContain("Independent critic audit");
  });
});
