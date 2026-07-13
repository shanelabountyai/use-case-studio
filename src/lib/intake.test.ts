import { describe, it, expect } from "vitest";
import { blankCase, evaluate } from "./engine";
import { parseUseCase } from "./validation";
import { intakeToPayload, isBotSubmission, hasMinimumContent, type IntakeAnswers } from "./intake";

/* A representative, fully-filled submission using the exact form field names
   and radio values shipped in public/discovery.html. */
const FULL: IntakeAnswers = {
  Company: "Acme Health",
  "Your name": "Dana Lee",
  email: "dana@acme.example",
  Date: "2026-07-12",
  Problem: "Support agents hand-search a policy PDF library to answer member questions.",
  "Current cost": "~30 hrs/week across 6 agents (estimate)",
  Users: "Member support team",
  "Desired outcome": "Agents get grounded, cited answers in seconds",
  "Acceptance bar": "90% of answers cite the correct policy section",
  "Data sources": "SharePoint policy library",
  "Data format": "Documents / unstructured",
  "Data volume": "Medium (hundreds–thousands)",
  "Data sensitivity": "Regulated (PHI, financial)",
  "Data freshness": "Updated periodically",
  "Task shape": "Answer from a knowledge base",
  "Task volume": "High (constant / at scale)",
  Latency: "Interactive (a few seconds)",
  Oversight: "Spot-check / sample",
  Budget: "$40k pilot",
  Compliance: "HIPAA",
  "Success and adoption notes": "Agents piloted a bot before; it stalled on trust.",
  botcheck: "",
};

describe("intakeToPayload — field mapping", () => {
  const p = intakeToPayload(FULL);

  it("maps free-text fields straight across", () => {
    expect(p.problem).toBe(FULL["Problem"]);
    expect(p.currentCost).toBe(FULL["Current cost"]);
    expect(p.users).toBe(FULL["Users"]);
    expect(p.outcome).toBe(FULL["Desired outcome"]);
    expect(p.acceptanceBar).toBe(FULL["Acceptance bar"]);
    expect(p.dataSources).toBe(FULL["Data sources"]);
    expect(p.budget).toBe(FULL["Budget"]);
    expect(p.compliance).toBe(FULL["Compliance"]);
  });

  it("translates every radio answer to its engine enum key", () => {
    expect(p.dataFormat).toBe("documents");
    expect(p.dataVolume).toBe("medium");
    expect(p.dataSensitivity).toBe("regulated");
    expect(p.dataFreshness).toBe("periodic");
    expect(p.taskShape).toBe("lookup");
    expect(p.taskVolume).toBe("high");
    expect(p.latency).toBe("interactive");
    expect(p.oversight).toBe("spot-check");
  });

  it("leaves scores/weights/thresholds at blankCase() defaults (practitioner scores on review)", () => {
    const base = blankCase();
    expect(p.scores).toEqual(base.scores);
    expect(p.weights).toEqual(base.weights);
    expect(p.thresholds).toEqual(base.thresholds);
  });

  it("preserves submitter provenance + success notes under intake, tagged source=intake", () => {
    expect(p.source).toBe("intake");
    expect(p.intake).toEqual({
      company: "Acme Health",
      submitterName: "Dana Lee",
      submitterEmail: "dana@acme.example",
      submittedDate: "2026-07-12",
      successNotes: "Agents piloted a bot before; it stalled on trust.",
    });
  });

  it("seeds a name from the company for the practitioner to rename", () => {
    expect(p.name).toBe("Intake — Acme Health");
    expect(intakeToPayload({ Problem: "x" }).name).toBe("Intake submission");
  });

  it("produces a payload the server validator accepts and the engine can score", () => {
    const parsed = parseUseCase(p);
    expect(parsed.ok).toBe(true);
    // Default 3/5 scores → a mid-range composite; the point is it evaluates cleanly.
    expect(() => evaluate(p)).not.toThrow();
  });
});

describe("intakeToPayload — robustness", () => {
  it("unknown/blank radio values become an empty enum, not a crash", () => {
    const p = intakeToPayload({ Problem: "x", "Task shape": "something we never listed" });
    expect(p.taskShape).toBe("");
    expect(p.dataFormat).toBe("");
  });

  it("matches on keywords despite wording drift", () => {
    expect(intakeToPayload({ Problem: "x", Latency: "REAL-TIME, sub-second please" }).latency).toBe("realtime");
    expect(intakeToPayload({ Problem: "x", "Data sensitivity": "contains PII" }).dataSensitivity).toBe("pii");
  });

  it("caps absurdly long field input", () => {
    const huge = "a".repeat(10_000);
    expect(intakeToPayload({ Problem: huge }).problem.length).toBe(5000);
  });
});

describe("intake gatekeeping", () => {
  it("flags a honeypot hit", () => {
    expect(isBotSubmission({ ...FULL, botcheck: "I am a bot" })).toBe(true);
    expect(isBotSubmission(FULL)).toBe(false);
  });

  it("requires a problem statement", () => {
    expect(hasMinimumContent(FULL)).toBe(true);
    expect(hasMinimumContent({ Company: "x" })).toBe(false);
  });
});
