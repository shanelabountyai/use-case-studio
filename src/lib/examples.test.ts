import { describe, it, expect } from "vitest";
import { evaluate } from "./engine";
import type { LibraryRecord } from "./engine";
import { EXAMPLES } from "./examples";
import { buildRegister } from "./register";

describe("worked examples", () => {
  it("policy assistant reproduces the pinned reference output (77 / BUILD / Quick win)", () => {
    const ev = evaluate(EXAMPLES[0]);
    expect(Math.round(ev.composite)).toBe(77);
    expect(ev.verdict).toBe("BUILD");
    expect(ev.quadrant).toBe("Quick win");
  });

  it("invoice triage evaluates to 66 / REFINE / Quick win", () => {
    const ev = evaluate(EXAMPLES[1]);
    expect(Math.round(ev.composite)).toBe(66);
    expect(ev.verdict).toBe("REFINE");
    expect(ev.quadrant).toBe("Quick win");
  });

  it("both examples carry default weights and thresholds", () => {
    for (const ex of EXAMPLES) {
      expect(ex.thresholds).toEqual({ build: 70, refine: 45 });
      expect(Object.values(ex.weights).reduce((a, b) => a + b, 0)).toBe(100);
    }
  });
});

describe("buildRegister", () => {
  const rec = (name: string, verdict: LibraryRecord["verdict"], composite: number): LibraryRecord => ({
    id: name, savedAt: "2026-07-06T00:00:00.000Z",
    uc: { ...EXAMPLES[0], name }, verdict, composite, quadrant: "Quick win",
  });

  it("groups by verdict and sorts each group by composite, descending", () => {
    const md = buildRegister([
      rec("Low build", "BUILD", 72),
      rec("Parked", "PARK", 30),
      rec("High build", "BUILD", 91),
    ]);
    const buildSection = md.split("## Build")[1].split("## Refine")[0];
    expect(buildSection.indexOf("High build")).toBeLessThan(buildSection.indexOf("Low build"));
    expect(md.split("## Park")[1]).toContain("Parked");
    expect(md.split("## Refine")[1].split("## Park")[0]).toContain("_none_");
  });

  it("emits the live Obsidian Bases table and index frontmatter", () => {
    const md = buildRegister([rec("Solo", "BUILD", 80)]);
    expect(md).toContain("```base");
    expect(md).toContain('type == "ai-use-case"');
    expect(md).toContain("type: ai-use-case-index");
  });
});
