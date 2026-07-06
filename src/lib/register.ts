import type { LibraryRecord } from "./engine";

/* Obsidian "AI Use-Case Register" builder, ported verbatim from the
   reference artifact. Pure function over saved library records. */

const FENCE = "```";
const BASE_PORTFOLIO_YAML = `filters:
  and:
    - 'type == "ai-use-case"'
formulas:
  readiness: 'if(score_data_readiness <= 2, "⚠️", "")'
properties:
  composite:
    displayName: Score
views:
  - type: table
    name: Portfolio
    groupBy:
      property: verdict
      direction: ASC
    order:
      - file.name
      - composite
      - quadrant
      - score_data_readiness
      - score_risk
      - formula.readiness
    summaries:
      composite: Average`;

export function buildRegister(library: LibraryRecord[]): string {
  const groups: Record<string, LibraryRecord[]> = {};
  library.forEach((r) => { (groups[r.verdict] || (groups[r.verdict] = [])).push(r); });
  const section = (label: string, key: string) => {
    const rows = (groups[key] || []).slice().sort((a, b) => b.composite - a.composite)
      .map((r) => `- [[${r.uc.name || "Untitled AI use case"}]] — ${r.composite}/100 · ${r.quadrant}`);
    return `## ${label}\n${rows.length ? rows.join("\n") : "_none_"}`;
  };
  const fm = ["---", `title: "AI Use-Case Register"`, "type: ai-use-case-index", "tags:", "  - ai-use-case", "  - moc", "---"].join("\n");
  const liveTable = `${FENCE}base\n${BASE_PORTFOLIO_YAML}\n${FENCE}`;
  return `${fm}\n\n# AI Use-Case Register\n\nA running index of evaluated AI use cases. Each entry links to its own note. The table below is live (Obsidian Bases 1.9+) and fills itself from note properties; the grouped links beneath are a plain-Markdown fallback.\n\n${liveTable}\n\n${section("Build", "BUILD")}\n\n${section("Refine", "REFINE")}\n\n${section("Park", "PARK")}\n`;
}
