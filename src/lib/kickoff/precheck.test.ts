import { describe, it, expect } from "vitest";
import { inputsPrecheck, needsPiiConfirm } from "./precheck";
import { CASE_POLICY_LOOKUP, CASE_INVOICE_CLASSIFY, CASE_THIN_PARK } from "./fixtures";

describe("inputsPrecheck", () => {
  it("passes a complete case", () => {
    expect(inputsPrecheck(CASE_POLICY_LOOKUP).ok).toBe(true);
  });

  it("fails a thin case and names every missing field", () => {
    const r = inputsPrecheck(CASE_THIN_PARK);
    expect(r.ok).toBe(false);
    const fields = r.missing.map((m) => m.field).sort();
    expect(fields).toEqual(["acceptanceBar", "dataSensitivity", "dataSources", "taskShape"]);
  });

  it("rejects an unresolvable task shape", () => {
    const r = inputsPrecheck({ ...CASE_POLICY_LOOKUP, taskShape: "banana" });
    expect(r.ok).toBe(false);
    expect(r.missing.some((m) => m.field === "taskShape")).toBe(true);
  });
});

describe("needsPiiConfirm", () => {
  it("is true when sensitivity is pii or regulated", () => {
    expect(needsPiiConfirm(CASE_INVOICE_CLASSIFY)).toBe(true); // pii
    expect(needsPiiConfirm({ ...CASE_POLICY_LOOKUP, dataSensitivity: "regulated" })).toBe(true);
  });

  it("is false for an internal case with clean free-text", () => {
    expect(needsPiiConfirm(CASE_POLICY_LOOKUP)).toBe(false); // internal, no PII in text
  });

  it("catches an email in free-text even when sensitivity is unset", () => {
    const uc = { ...CASE_POLICY_LOOKUP, dataSensitivity: "internal", problem: "email jane@acme.com about it" };
    expect(needsPiiConfirm(uc)).toBe(true);
  });
});
