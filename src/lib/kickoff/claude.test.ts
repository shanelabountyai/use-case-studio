/* BK-3/BK-4 — the Claude-backed stages, with the SDK mocked. No network, no
   spend. Covers the money path: structured-output parse, retry-once on a schema
   miss, refusal handling, token accounting, and the critic's independence.

   zodOutputFormat is deliberately NOT mocked — running it for real proves the
   zod/v4 contracts in contracts.ts actually convert to a JSON schema the SDK
   accepts, which is the thing most likely to break silently. */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { serializeGrounding } from "./grounding";
import { CASE_POLICY_LOOKUP } from "./fixtures";
import type { IntegratedPlan, CriticAudit } from "./contracts";

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

const { realPlanner, realCritic } = await import("./claude");

const ID = "00000000-0000-4000-8000-0000000000c3";
const g = serializeGrounding(ID, CASE_POLICY_LOOKUP);

const PLAN: IntegratedPlan = {
  schemaVersion: "1",
  verdict: "BUILD",
  taskShape: "lookup",
  architecturePattern: g.recommendation.architecturePattern,
  executiveSummary: "RAG over the policy corpus.",
  sections: {
    architecture: { heading: "Architecture", markdown: "Retrieval with citations." },
    dataPipeline: { heading: "Data", markdown: "Ingest, chunk, embed." },
    evaluation: { heading: "Eval", markdown: "Golden set; citation correctness." },
    governance: { heading: "Governance", markdown: "Permission-aware retrieval." },
    delivery: { heading: "Delivery", markdown: "~12 weeks (estimate)." },
  },
  dataFlows: [{ name: "online", steps: ["query", "retrieve", "answer"] }],
  milestones: [{ phase: "P1", goal: "MVP", exitCriterion: "golden set holds" }],
  assumptions: ["English corpus (estimate)"],
  refineGate: null,
};

const AUDIT: CriticAudit = {
  schemaVersion: "1",
  fabricationScan: [],
  consistencyIssues: [],
  verdictIntegrity: { pass: true, note: "matches grounding" },
  gaps: [{ title: "rollback", detail: "no rollback path described" }],
  acceptanceBarSpine: { isSpine: true, evidence: "milestones ladder to the bar" },
  overclaims: [],
  verdict: "SHIP WITH FIXES",
  topFixes: ["describe rollback"],
};

/** A well-formed Messages API reply carrying `body` as its JSON text block. */
const reply = (body: unknown, usage = { input_tokens: 100, output_tokens: 50 }) => ({
  stop_reason: "end_turn",
  content: [{ type: "text", text: JSON.stringify(body) }],
  usage,
});

beforeEach(() => create.mockReset());

describe("realPlanner", () => {
  it("returns the parsed plan and the reported token usage", async () => {
    create.mockResolvedValueOnce(reply(PLAN, { input_tokens: 4000, output_tokens: 2500 }));
    const r = await realPlanner(g);
    expect(r.plan.architecturePattern).toBe(g.recommendation.architecturePattern);
    expect(r.inputTokens).toBe(4000);
    expect(r.outputTokens).toBe(2500);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("sends the grounding and asks for structured output", async () => {
    create.mockResolvedValueOnce(reply(PLAN));
    await realPlanner(g);
    const req = create.mock.calls[0][0];
    // zodOutputFormat ran on the real contract and produced a usable JSON schema.
    expect(req.output_config.format.type).toBe("json_schema");
    expect(req.output_config.format.schema.properties.architecturePattern).toBeTruthy();
    expect(String(req.messages[0].content)).toContain(g.acceptanceBar);
  });

  it("retries exactly once on schema-invalid output, feeding the error back", async () => {
    create
      .mockResolvedValueOnce(reply({ schemaVersion: "1", verdict: "BUILD" })) // missing required fields
      .mockResolvedValueOnce(reply(PLAN, { input_tokens: 10, output_tokens: 5 }));

    const r = await realPlanner(g);
    expect(create).toHaveBeenCalledTimes(2);
    // Tokens accumulate across BOTH attempts — a retry is not free.
    expect(r.inputTokens).toBe(110);
    expect(r.outputTokens).toBe(55);

    const retryMsgs = create.mock.calls[1][0].messages;
    expect(String(retryMsgs.at(-1).content)).toMatch(/failed schema validation/i);
  });

  it("throws after a second schema miss (worker turns this into a partial)", async () => {
    create.mockResolvedValue(reply({ nope: true }));
    await expect(realPlanner(g)).rejects.toThrow(/invalid after retry/i);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("throws on a refusal instead of returning an empty plan", async () => {
    create.mockResolvedValueOnce({
      stop_reason: "refusal",
      content: [],
      usage: { input_tokens: 10, output_tokens: 0 },
    });
    await expect(realPlanner(g)).rejects.toThrow(/refused/i);
    expect(create).toHaveBeenCalledTimes(1); // a refusal is not retried
  });
});

describe("realCritic", () => {
  it("returns the parsed audit", async () => {
    create.mockResolvedValueOnce(reply(AUDIT));
    const r = await realCritic(PLAN, g);
    expect(r.audit.verdict).toBe("SHIP WITH FIXES");
    expect(r.audit.gaps.length).toBeGreaterThan(0);
  });

  it("receives only the plan and the grounding — no planner internals (P0.6)", async () => {
    create.mockResolvedValueOnce(reply(AUDIT));
    await realCritic(PLAN, g);
    const req = create.mock.calls[0][0];

    // Exactly one user turn: the audit payload. No planner messages carried over.
    expect(req.messages).toHaveLength(1);
    const payload = String(req.messages[0].content);
    expect(payload).toContain("PLAN TO AUDIT");
    expect(payload).toContain(PLAN.executiveSummary);

    // The planner's own instructions must never reach the critic.
    expect(req.system).not.toMatch(/senior AI delivery architect/i);
    expect(payload).not.toMatch(/senior AI delivery architect/i);
  });
});
