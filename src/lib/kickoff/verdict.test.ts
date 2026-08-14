import { describe, it, expect } from "vitest";
import { deriveVerdict } from "./claude";
import type { CriticAudit } from "./contracts";

/* The model's verdict was constant across 8 measured runs — including a
   deliberately incoherent case — so it is now computed from the findings.
   These pin the mapping. */
const base: Omit<CriticAudit, "verdict"> = {
  schemaVersion: "1",
  fabricationScan: [],
  consistencyIssues: [],
  verdictIntegrity: { pass: true, note: "matches" },
  gaps: [{ title: "rollback", detail: "no rollback path defined" }],
  acceptanceBarSpine: { isSpine: true, evidence: "milestones gate on the bar" },
  overclaims: [],
  topFixes: [],
};

describe("deriveVerdict", () => {
  it("SHIP AS-IS when nothing but a gap was found", () => {
    // Gaps alone must not block — the schema requires at least one, so counting
    // them as defects would pin every audit to SHIP WITH FIXES.
    expect(deriveVerdict(base)).toBe("SHIP AS-IS");
  });

  it("NEEDS REWORK on a must-remove fabrication", () => {
    expect(deriveVerdict({ ...base, fabricationScan: [{ quote: "zero errors guaranteed", verdict: "must-remove" }] }))
      .toBe("NEEDS REWORK");
  });

  it("NEEDS REWORK when the acceptance bar isn't the spine", () => {
    expect(deriveVerdict({ ...base, acceptanceBarSpine: { isSpine: false, evidence: "bar is unmeasurable" } }))
      .toBe("NEEDS REWORK");
  });

  it("NEEDS REWORK when the plan drifted off the server verdict", () => {
    expect(deriveVerdict({ ...base, verdictIntegrity: { pass: false, note: "argues for BUILD from a REFINE" } }))
      .toBe("NEEDS REWORK");
  });

  it("SHIP WITH FIXES on bounded issues — overclaims or unlabeled estimates", () => {
    expect(deriveVerdict({ ...base, overclaims: ["eliminates all manual review"] })).toBe("SHIP WITH FIXES");
    expect(deriveVerdict({ ...base, fabricationScan: [{ quote: "cuts cost 40%", verdict: "must-label" }] }))
      .toBe("SHIP WITH FIXES");
    expect(deriveVerdict({ ...base, consistencyIssues: ["P2 depends on a P3 artifact"] })).toBe("SHIP WITH FIXES");
  });

  it("is not constant — the failure that motivated it", () => {
    const seen = new Set([
      deriveVerdict(base),
      deriveVerdict({ ...base, overclaims: ["x"] }),
      deriveVerdict({ ...base, acceptanceBarSpine: { isSpine: false, evidence: "" } }),
    ]);
    expect(seen.size).toBe(3);
  });
});
