/* =============================================================
   Build Kickoff Package (BK-8). Pure renderer — the client-facing deliverable.

   renderPlanMarkdown (export.ts) is the internal artifact: plan + audit, no
   client framing. This assembles the sellable one — decision, diagrams,
   milestones, PRD starters, provenance — with the client's name on it.

   PRDs are NOT generated here. Each milestone gets a ready-to-paste prompt
   carrying its own grounding, run in Claude Code where the PRD can be iterated
   against the actual repo. That keeps the per-run cost at the planner+critic
   pair instead of multiplying it by the milestone count.
   ============================================================= */

import type { UseCase } from "../engine";
import { evaluate } from "../engine";
import type { EngagementInputs } from "../deliverykit";
import type { IntegratedPlan, CriticAudit, Provenance } from "./contracts";
import { DECISION_SUPPORT_DISCLAIMER } from "./export";

const bullet = (s: string) => `- ${s}`;

/* Mermaid, not an image: it renders in GitHub, Notion, and the studio's own
   artifact viewer, and survives copy-paste into a doc. A PNG would need a
   render pipeline and would stop being editable. */
function flowDiagram(name: string, steps: string[], idx: number): string {
  const id = (i: number) => `n${idx}_${i}`;
  const esc = (s: string) => s.replace(/["\n]/g, " ").replace(/\s+/g, " ").trim();
  const nodes = steps.map((s, i) => `  ${id(i)}["${esc(s)}"]`);
  const edges = steps.slice(1).map((_, i) => `  ${id(i)} --> ${id(i + 1)}`);
  return ["```mermaid", "flowchart TD", ...nodes, ...edges, "```"].join("\n");
}

/* One self-contained prompt per milestone. Everything the PRD needs travels
   inside it — the reader shouldn't have to hunt up the plan to use it. */
function prdStarter(
  m: IntegratedPlan["milestones"][number],
  uc: UseCase,
  plan: IntegratedPlan,
  audit: CriticAudit | null,
): string {
  const relatedGaps = audit?.gaps.slice(0, 3).map((g) => `${g.title}: ${g.detail}`) ?? [];
  return [
    `#### ${m.phase} — ${m.goal}`,
    "",
    `**Exit criterion (this is the PRD's acceptance bar):** ${m.exitCriterion}`,
    "",
    "<details><summary>PRD starter prompt — paste into Claude Code</summary>",
    "",
    "```text",
    `Write a PRD for one milestone of an AI build. Ground everything in the context below and do not invent facts, benchmarks, or vendor requirements.`,
    "",
    `USE CASE: ${uc.name}`,
    `PROBLEM: ${uc.problem}`,
    `USERS: ${uc.users}`,
    `PROJECT ACCEPTANCE BAR: ${uc.acceptanceBar}`,
    `ARCHITECTURE PATTERN: ${plan.architecturePattern}`,
    `TASK SHAPE: ${plan.taskShape}`,
    "",
    `MILESTONE: ${m.phase} — ${m.goal}`,
    `MILESTONE EXIT CRITERION: ${m.exitCriterion}`,
    m.ownerOfRisk ? `RISK OWNER: ${m.ownerOfRisk}` : "",
    "",
    `ALL MILESTONES (for sequencing context):`,
    ...plan.milestones.map((x) => `  ${x.phase}: ${x.goal} — exit: ${x.exitCriterion}`),
    "",
    relatedGaps.length ? `KNOWN GAPS FROM THE INDEPENDENT AUDIT (address or explicitly defer):` : "",
    ...relatedGaps.map((g) => `  - ${g}`),
    "",
    `ASSUMPTIONS ALREADY LABELED IN THE PLAN (do not silently promote to fact):`,
    ...plan.assumptions.slice(0, 6).map((a) => `  - ${a}`),
    "",
    `Produce: Context · Scope (in/out) · Acceptance criteria (derived from the exit criterion, each independently testable) · Dependencies · Risks and mitigations · Open questions. Mark every estimate as an estimate.`,
    "```",
    "",
    "</details>",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/** The client-facing package. `audit` may be null for a partial run — the
 *  disclaimer and the missing-audit warning are bound here either way, so no
 *  path emits a package that looks more validated than it is. */
export function renderKickoffPackage(input: {
  uc: UseCase;
  plan: IntegratedPlan;
  audit: CriticAudit | null;
  provenance: Provenance;
  engagement: Partial<EngagementInputs>;
  version: number;
  generatedOn: string; // caller supplies — keeps this pure and testable
}): string {
  const { uc, plan, audit, provenance, engagement, version, generatedOn } = input;
  const ev = evaluate(uc);
  const client = engagement.client?.trim() || "—";
  const practitioner = engagement.practitioner?.trim() || "Lab Intelligence, LLC";

  const sec = (label: string, s?: { heading: string; markdown: string }) =>
    s ? [`### ${label} — ${s.heading}`, "", s.markdown, ""] : [];

  const parts: string[] = [
    `# Build Kickoff Package — ${uc.name}`,
    "",
    `**Prepared for:** ${client}${engagement.sponsor ? ` · Sponsor: ${engagement.sponsor}` : ""}  `,
    `**Prepared by:** ${practitioner}  `,
    `**Date:** ${generatedOn} · **Plan version:** v${version}`,
    "",
    DECISION_SUPPORT_DISCLAIMER,
    "",
    "---",
    "",
    "## 1. Decision & rationale",
    "",
    `**Verdict: ${ev.verdict}** — composite ${ev.composite.toFixed(0)}/100 · ${ev.quadrant}`,
    "",
    ev.verdictWhy,
    "",
    plan.executiveSummary,
    "",
  ];

  if (ev.flags.length) {
    parts.push(
      "**Flags raised during evaluation**",
      ...ev.flags.map((f) => bullet(`_${f.sev}_ — ${f.text}`)),
      "",
    );
  }

  parts.push(
    "## 2. Architecture",
    "",
    `**Pattern:** ${plan.architecturePattern} · **Task shape:** ${plan.taskShape}`,
    "",
    ...sec("Architecture", plan.sections.architecture),
    ...sec("Data pipeline", plan.sections.dataPipeline),
    ...sec("Integration", plan.sections.integrationNotes),
    "## 3. Workflows",
    "",
  );

  plan.dataFlows.forEach((f, i) => {
    parts.push(`### ${f.name}`, "", flowDiagram(f.name, f.steps, i), "");
  });

  parts.push(
    "## 4. Delivery plan",
    "",
    ...plan.milestones.map((m) =>
      bullet(`**${m.phase}** — ${m.goal}${m.duration ? ` _(${m.duration})_` : ""}. **Exit:** ${m.exitCriterion}${m.ownerOfRisk ? ` · Risk owner: ${m.ownerOfRisk}` : ""}`),
    ),
    "",
    ...sec("Delivery", plan.sections.delivery),
    "## 5. Requirements — PRD starters",
    "",
    "One prompt per milestone. Each carries its own grounding, so it can be run standalone in Claude Code against the target repo. The milestone's exit criterion is the PRD's acceptance bar — don't loosen it there.",
    "",
    ...plan.milestones.map((m) => `${prdStarter(m, uc, plan, audit)}\n`),
    "## 6. Evaluation & acceptance",
    "",
    `**Project acceptance bar:** ${uc.acceptanceBar}`,
    "",
    ...sec("Evaluation", plan.sections.evaluation),
    "## 7. Governance & risk",
    "",
    ...sec("Governance", plan.sections.governance),
  );

  parts.push("## 8. Assumptions, audit & provenance", "");

  if (plan.assumptions.length)
    parts.push("**Labeled estimates and assumptions**", ...plan.assumptions.map(bullet), "");

  if (audit) {
    parts.push(
      `**Independent critic audit: ${audit.verdict}**`,
      "",
      `Acceptance bar is the spine: ${audit.acceptanceBarSpine.isSpine ? "yes" : "**NO**"} — ${audit.acceptanceBarSpine.evidence}`,
      "",
    );
    if (audit.topFixes.length) parts.push("**Top fixes before build**", ...audit.topFixes.map(bullet), "");
    if (audit.gaps.length)
      parts.push("**Load-bearing gaps**", ...audit.gaps.map((g) => bullet(`**${g.title}** — ${g.detail}`)), "");
    if (audit.overclaims.length) parts.push("**Overclaims flagged**", ...audit.overclaims.map(bullet), "");
  } else {
    // A partial run reaches here; say so rather than let absence read as clean.
    parts.push(
      "> **No independent audit is attached.** This run did not complete its critic stage, so nothing has checked this plan for fabricated figures or overclaims. Treat it as a draft.",
      "",
    );
  }

  parts.push(
    "**Provenance**",
    bullet(`Model: \`${provenance.model}\``),
    bullet(`Prompt roster: \`${provenance.promptRosterVersion}\``),
    bullet(`Verdict at generation: **${provenance.verdictAtGeneration}**`),
    bullet(`Case version: \`${provenance.caseVersion}\``),
    "",
    DECISION_SUPPORT_DISCLAIMER,
    "",
  );

  return parts.join("\n");
}
