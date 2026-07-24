import { describe, it, expect } from "vitest";
import { serializeGrounding, caseVersionHash, parkNote } from "./grounding";
import { GroundingInput } from "./contracts";
import { recArchitecture, evaluate } from "../engine";
import { CASE_POLICY_LOOKUP, CASE_INVOICE_CLASSIFY, CASE_THIN_PARK } from "./fixtures";

const ID = "11111111-1111-4111-8111-111111111111";

describe("serializeGrounding", () => {
  it("validates against the schema for both prototype cases", () => {
    expect(GroundingInput.safeParse(serializeGrounding(ID, CASE_POLICY_LOOKUP)).success).toBe(true);
    expect(GroundingInput.safeParse(serializeGrounding(ID, CASE_INVOICE_CLASSIFY)).success).toBe(true);
  });

  it("is byte-stable: identical input → identical serialized output (stable field ordering)", () => {
    const a = JSON.stringify(serializeGrounding(ID, CASE_POLICY_LOOKUP));
    const b = JSON.stringify(serializeGrounding(ID, CASE_POLICY_LOOKUP));
    expect(a).toBe(b);
  });

  it("pins architecturePattern to recArchitecture().pattern (never re-patterned)", () => {
    const g = serializeGrounding(ID, CASE_POLICY_LOOKUP);
    expect(g.recommendation.architecturePattern).toBe(recArchitecture(CASE_POLICY_LOOKUP).pattern);
    expect(g.recommendation.architecturePattern).toMatch(/RAG/);
  });

  it("carries the engine's verdict, all 7 contribs, and 6 CRISP phases", () => {
    const g = serializeGrounding(ID, CASE_POLICY_LOOKUP);
    expect(g.verdict).toBe("BUILD");
    expect(g.taskShape).toBe("lookup");
    expect(g.evaluation.contribs).toHaveLength(7);
    expect(g.recommendation.crisp).toHaveLength(6);
    expect(g.recommendation.crisp[0].actions.length).toBeGreaterThan(0);
    expect(g.recommendation.dataAccess.length).toBeGreaterThan(0);
    expect(g.acceptanceBar).toContain("≥90%");
  });

  it("classify case surfaces REFINE + the classifier architecture family", () => {
    const g = serializeGrounding(ID, CASE_INVOICE_CLASSIFY);
    expect(g.verdict).toBe("REFINE");
    expect(g.taskShape).toBe("classify");
    // data readiness 2/5 → a weak-data warn flag rides along in grounding
    expect(g.evaluation.flags.some((f) => /data readiness/i.test(f.text))).toBe(true);
  });

  it("coerces an unknown taskShape to the empty enum member", () => {
    const g = serializeGrounding(ID, CASE_THIN_PARK); // taskShape: ""
    expect(g.taskShape).toBe("");
  });

  it("caps over-long embedded free-text but never the pulled-out acceptanceBar", () => {
    const long = "x".repeat(9000);
    const g = serializeGrounding(ID, { ...CASE_POLICY_LOOKUP, problem: long, acceptanceBar: long });
    expect((g.useCase.problem as string).endsWith("…⟪truncated⟫")).toBe(true);
    expect((g.useCase.problem as string).length).toBeLessThan(long.length);
    expect(g.acceptanceBar).toBe(long); // spine kept whole
  });

  it("caseVersion hash is deterministic and changes when the payload changes", () => {
    expect(caseVersionHash(CASE_POLICY_LOOKUP)).toBe(caseVersionHash(CASE_POLICY_LOOKUP));
    expect(caseVersionHash(CASE_POLICY_LOOKUP)).not.toBe(
      caseVersionHash({ ...CASE_POLICY_LOOKUP, name: "changed" }),
    );
    expect(caseVersionHash(CASE_POLICY_LOOKUP)).toMatch(/^sha256:[0-9a-f]{16}$/);
  });
});

describe("parkNote", () => {
  it("names the weakest dimensions and the critical data flag, no plan", () => {
    const note = parkNote(CASE_THIN_PARK);
    expect(evaluate(CASE_THIN_PARK).verdict).toBe("PARK");
    expect(note).toContain("Data readiness"); // weakest dim at 1/5
    expect(note).toMatch(/critical-low/i); // critical flag text included
    expect(note).toContain("no plan is generated");
  });

  it("is deterministic", () => {
    expect(parkNote(CASE_THIN_PARK)).toBe(parkNote(CASE_THIN_PARK));
  });
});
