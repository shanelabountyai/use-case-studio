import { describe, it, expect } from "vitest";
import { blankCase, type LibraryRecord, type Verdict } from "./engine";
import { buildRegister } from "./register";

const rec = (name: string, verdict: Verdict, composite: number, quadrant = "Quick win"): LibraryRecord => ({
  id: name, savedAt: "2026-01-01T00:00:00.000Z", uc: { ...blankCase(), name }, verdict, composite, quadrant,
});

const section = (md: string, heading: string) => {
  const start = md.indexOf(`## ${heading}\n`);
  const next = md.indexOf("\n## ", start + 1);
  return md.slice(start, next === -1 ? undefined : next);
};

describe("buildRegister — Obsidian AI Use-Case Register", () => {
  it("emits index front-matter and the live Bases table", () => {
    const md = buildRegister([]);
    expect(md.startsWith("---\ntitle: \"AI Use-Case Register\"\ntype: ai-use-case-index")).toBe(true);
    expect(md).toContain("```base\n");
    expect(md).toContain("'type == \"ai-use-case\"'");
  });

  it("groups by verdict in Build / Refine / Park order, highest composite first", () => {
    const md = buildRegister([
      rec("Low build", "BUILD", 71), rec("Parked", "PARK", 20, "Money pit"),
      rec("High build", "BUILD", 88), rec("Refine me", "REFINE", 55, "Big bet"),
    ]);
    expect(md.indexOf("## Build")).toBeLessThan(md.indexOf("## Refine"));
    expect(md.indexOf("## Refine")).toBeLessThan(md.indexOf("## Park"));
    const build = section(md, "Build");
    expect(build.indexOf("[[High build]]")).toBeLessThan(build.indexOf("[[Low build]]"));
    expect(build).toContain("- [[High build]] — 88/100 · Quick win");
    expect(section(md, "Refine")).toContain("- [[Refine me]] — 55/100 · Big bet");
    expect(section(md, "Park")).toContain("- [[Parked]] — 20/100 · Money pit");
  });

  it("marks empty groups _none_ and links unnamed cases with a placeholder title", () => {
    const md = buildRegister([rec("", "REFINE", 50)]);
    expect(section(md, "Build")).toContain("_none_");
    expect(section(md, "Park")).toContain("_none_");
    expect(section(md, "Refine")).toContain("[[Untitled AI use case]]");
  });

  it("does not reorder the caller's array", () => {
    const lib = [rec("a", "BUILD", 70), rec("b", "BUILD", 90)];
    buildRegister(lib);
    expect(lib.map((r) => r.id)).toEqual(["a", "b"]);
  });
});
