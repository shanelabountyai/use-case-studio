import { describe, it, expect } from "vitest";
import { generateShareToken, shareUrl, toPublicBrief } from "./sharing";
import { blankCase, evaluate, type UseCase } from "./engine";

describe("generateShareToken", () => {
  it("is at least 24 chars and URL-safe", () => {
    const t = generateShareToken();
    expect(t.length).toBeGreaterThanOrEqual(24);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is unique across many calls (crypto-random)", () => {
    const set = new Set(Array.from({ length: 1000 }, () => generateShareToken()));
    expect(set.size).toBe(1000);
  });
});

describe("shareUrl", () => {
  it("joins origin and token without a double slash", () => {
    expect(shareUrl("https://x.app", "tok")).toBe("https://x.app/s/tok");
    expect(shareUrl("https://x.app/", "tok")).toBe("https://x.app/s/tok");
  });
});

describe("toPublicBrief", () => {
  // A case whose confidential fields all carry recognizable sentinel values,
  // so we can assert none of them survive the projection.
  const secret = "CONFIDENTIAL";
  const uc: UseCase = {
    ...blankCase(),
    name: "Public name",
    problem: "Public problem",
    outcome: "Public outcome",
    acceptanceBar: "95% precision",
    dataSources: "CRM export",
    currentCost: secret,
    users: secret,
    budget: secret,
    compliance: secret,
    dataSensitivity: "regulated",
    scores: { value: 5, feasibility: 5, dataReadiness: 5, risk: 5, cost: 1, timeToValue: 5, fit: 5 },
  };

  it("keeps exactly the fields the brief renders", () => {
    const { uc: safe } = toPublicBrief(uc, evaluate(uc));
    expect(safe.name).toBe("Public name");
    expect(safe.problem).toBe("Public problem");
    expect(safe.outcome).toBe("Public outcome");
    expect(safe.acceptanceBar).toBe("95% precision");
    expect(safe.dataSources).toBe("CRM export");
  });

  it("drops every confidential input from the projected case", () => {
    const { uc: safe } = toPublicBrief(uc, evaluate(uc));
    // No sentinel value survives anywhere in the serialized case.
    expect(JSON.stringify(safe)).not.toContain(secret);
    expect(safe.budget).toBe("");
    expect(safe.currentCost).toBe("");
    expect(safe.compliance).toBe("");
    expect(safe.dataSensitivity).toBe("");
    // Raw scores reset to the neutral blank baseline, not the real inputs.
    expect(safe.scores).toEqual(blankCase().scores);
  });

  it("strips the per-dimension score/weight breakdown from the evaluation", () => {
    const ev = evaluate(uc);
    const { ev: safe } = toPublicBrief(uc, ev);
    // Derived summary the brief shows is preserved…
    expect(safe.verdict).toBe(ev.verdict);
    expect(safe.composite).toBe(ev.composite);
    expect(safe.quadrant).toBe(ev.quadrant);
    expect(safe.flags).toEqual(ev.flags);
    // …but the raw score/weight contributions are gone.
    expect(safe.contribs).toEqual([]);
  });
});
