/* =============================================================
   AI Use-Case Studio — DELIVERY KIT (post-BUILD module)
   Pure, deterministic generators. No React, no IO.
   Reuses the evaluation engine so every deliverable stays
   consistent with the case's scores, flags, and recommendations.

   Honesty notes baked in:
   - The SOW is a starting template, NOT legal advice. It carries a
     visible disclaimer and must be reviewed by the parties/counsel.
   - CPMAI phase labels follow the published six-phase structure;
     confirm exact wording against your current v7 materials.
   ============================================================= */

import {
  type UseCase, type LibraryRecord, type Verdict,
  evaluate, recArchitecture, recDataAccess, recTesting, optLabel,
} from "./engine";

/* --------------------- engagement inputs -------------------- */

export interface EngagementInputs {
  client: string;
  sponsor: string;        // executive sponsor / decision owner
  practitioner: string;   // your firm
  durationWeeks: number;
  startDate: string;      // ISO date or ""
  commercialModel: string; // "Fixed fee" | "Time & materials" | "Retainer"
}

export const blankEngagement = (): EngagementInputs => ({
  client: "",
  sponsor: "",
  practitioner: "Lab Intelligence, LLC",
  durationWeeks: 8,
  startDate: "",
  commercialModel: "Fixed fee",
});

/* ----------------------- discovery guide -------------------- */

export interface DiscoverySection { title: string; questions: string[]; }
export interface DiscoveryGuide { sections: DiscoverySection[]; }

/** Structured intake questions. Base set is always present; targeted
 *  probes are appended wherever THIS case is thin or scored low, so the
 *  guide sharpens the exact inputs the evaluation is least sure about. */
export function buildDiscoveryGuide(uc: UseCase): DiscoveryGuide {
  const sections: DiscoverySection[] = [];

  const business: string[] = [
    "What decision or outcome does this use case change, and who owns that outcome?",
    "What does the current process cost today — hours, dollars, error rate — and how is that measured?",
    "What happens if we do nothing for another year?",
  ];
  if (!uc.currentCost.trim()) business.push("PROBE: the cost of the status quo isn't quantified yet — walk through a recent week and estimate the hours and rework involved.");
  if (!uc.acceptanceBar.trim()) business.push("PROBE: there's no measurable acceptance bar — what single number or threshold would let us agree this works?");
  sections.push({ title: "Business understanding", questions: business });

  const data: string[] = [
    `Where does the data live today (${uc.dataSources || "not yet named"}), who owns access, and how is it granted?`,
    "Who has actually opened these sources recently, and how clean are they really versus how clean we assume?",
    "Are there examples of correct/incorrect outcomes we could turn into an evaluation set?",
  ];
  if (uc.scores.dataReadiness <= 2) data.push("PROBE: data readiness scored low — before scoping, can we get a real sample in the room to inspect by hand?");
  if (uc.dataSensitivity === "pii" || uc.dataSensitivity === "regulated") data.push("PROBE: sensitive data is involved — what are the access, retention, and residency rules we must design around?");
  sections.push({ title: "Data understanding", questions: data });

  const constraints: string[] = [
    `What are the hard constraints — latency (${optLabel("latency", uc.latency)}), budget, and any regulatory obligations?`,
    `What level of human oversight is required (${optLabel("oversight", uc.oversight)}), and who staffs the review?`,
    "What existing systems must this fit into, and who controls them?",
  ];
  sections.push({ title: "Constraints & environment", questions: constraints });

  sections.push({
    title: "Success & adoption",
    questions: [
      "Who has to change how they work for this to deliver value, and are they bought in?",
      "How will we run a pilot, and what would make you comfortable expanding it?",
      "What has been tried before here, and why did it stall?",
    ],
  });

  return { sections };
}

/* ------------------------- portfolio ------------------------ */

export interface PortfolioEntry { name: string; verdict: Verdict; composite: number; quadrant: string; }
export interface Portfolio {
  ranked: PortfolioEntry[];
  quadrantCounts: Record<string, number>;
  sequencing: string[];
  narrative: string;
}

/** Rollup across saved cases. Verdict/composite/quadrant come straight
 *  from the engine's stored evaluation — this never re-invents scoring. */
export function buildPortfolio(records: LibraryRecord[]): Portfolio {
  const ranked: PortfolioEntry[] = records
    .map((r) => ({ name: r.uc.name || "Untitled", verdict: r.verdict, composite: r.composite, quadrant: r.quadrant }))
    .sort((a, b) => b.composite - a.composite);

  const quadrantCounts: Record<string, number> = {};
  ranked.forEach((e) => { quadrantCounts[e.quadrant] = (quadrantCounts[e.quadrant] || 0) + 1; });

  // Sequencing: quick wins first (prove value cheaply), then big bets, then fill-ins. Park excluded.
  const order = ["Quick win", "Big bet", "Fill-in"];
  const sequencing = order.flatMap((q) =>
    ranked.filter((e) => e.quadrant === q && e.verdict !== "PARK").map((e) => `${e.name} — ${q.toLowerCase()} (${e.composite}/100)`)
  );

  const builds = ranked.filter((e) => e.verdict === "BUILD").length;
  const narrative = ranked.length === 0
    ? "No evaluated cases yet — run intake and scoring first."
    : `${ranked.length} evaluated ${ranked.length === 1 ? "case" : "cases"}; ${builds} at BUILD. Recommended path: land a quick win to prove the operating model, then take on the highest-value big bet once the delivery rhythm is established. Parked cases are documented, not discarded — revisit them when their blocking condition changes.`;

  return { ranked, quadrantCounts, sequencing, narrative };
}

/* ---------------------------- SOW --------------------------- */

export interface SowSection { heading: string; body: string; }
export interface Sow { title: string; disclaimer: string; sections: SowSection[]; }

const SOW_DISCLAIMER =
  "This statement of work is a drafting starting point generated from the evaluation inputs. It is not legal advice and is not a binding agreement. Both parties (and, where appropriate, legal counsel) must review and adapt it before execution.";

function commercialsBody(eng: EngagementInputs): string {
  const model = eng.commercialModel || "Fixed fee";
  if (model === "Fixed fee")
    return "Fixed fee of $[amount], invoiced against milestones tied to the plan — for example 40% on kickoff, 30% on pilot delivery, and 30% on acceptance. Anchoring the final installment to the acceptance criteria above protects both parties.";
  if (model === "Retainer")
    return "Monthly retainer of $[amount] covering [scope / hours per month], billed in advance, [N]-month minimum, [30]-day notice to end.";
  if (model.toLowerCase().startsWith("time"))
    return "Time & materials at $[rate]/hour against a not-to-exceed cap of $[cap]; weekly time reporting; the cap isn't exceeded without a written change order.";
  return `${model}. [Amount and payment schedule to be completed.]`;
}

export function buildSow(uc: UseCase, eng: EngagementInputs): Sow {
  const ev = evaluate(uc);
  const arch = recArchitecture(uc);
  const test = recTesting(uc);
  const bar = uc.acceptanceBar.trim() || "TBD — a measurable acceptance bar must be agreed before work begins";

  const sections: SowSection[] = [
    { heading: "Parties", body: `${eng.practitioner || "[Practitioner]"} (\u201cProvider\u201d) and ${eng.client || "[Client]"} (\u201cClient\u201d). Executive sponsor: ${eng.sponsor || "[name]"}.` },
    { heading: "Background", body: `${uc.problem || "[problem statement]"}${uc.currentCost ? ` Current cost of the status quo: ${uc.currentCost}.` : ""}` },
    { heading: "Objective", body: `${uc.outcome || "[desired outcome]"} The engagement delivers a pilot implementation using ${arch.pattern.toLowerCase()}, evaluated against the agreed acceptance bar.` },
    { heading: "In scope", body: `Discovery and data assessment; a working pilot built with ${arch.pattern.toLowerCase()}; an evaluation harness and results against the acceptance bar; a staged-rollout recommendation and handover.` },
    { heading: "Out of scope", body: "Production operation and 24/7 support; procurement of third-party licenses/infrastructure; changes to source systems of record; work on use cases other than the one named above unless added by change order." },
    { heading: "Deliverables", body: "1) Discovery findings and confirmed acceptance bar. 2) Data readiness assessment. 3) Pilot implementation. 4) Evaluation report against the acceptance bar. 5) Delivery plan, risk register, and rollout recommendation." },
    { heading: "Acceptance criteria", body: `Work is accepted when the pilot meets the agreed acceptance bar: ${bar}. Evaluation method: ${test.layers[1]?.body?.split(".")[0] || "agreed at kickoff"}.` },
    { heading: "Assumptions", body: `Client provides timely access to the named data sources (${uc.dataSources || "[sources]"}) and to subject-matter experts; a decision owner (${eng.sponsor || "[sponsor]"}) is available for review checkpoints; the acceptance bar is fixed at kickoff and changes go through change control.` },
    { heading: "Timeline", body: `${eng.durationWeeks || 8} weeks${eng.startDate ? `, starting ${eng.startDate.slice(0, 10)}` : ""}, structured around the CPMAI-aligned delivery plan attached.` },
    { heading: "Commercials", body: commercialsBody(eng) },
    { heading: "Governance", body: "Weekly checkpoint with the sponsor; decisions and scope changes logged; a pre-agreed rollback trigger governs any move toward production." },
  ];
  if (ev.verdict !== "BUILD") {
    sections.unshift({ heading: "Readiness note", body: `The evaluation returned ${ev.verdict}, not BUILD (${ev.verdictWhy}) This SOW should be treated as conditional until the flagged issues are resolved.` });
  }
  return { title: `Statement of Work — ${uc.name || "AI use case"}`, disclaimer: SOW_DISCLAIMER, sections };
}

/* --------------------- CPMAI delivery plan ------------------ */

export interface PlanPhase { phase: string; objective: string; activities: string[]; deliverables: string[]; exitCriteria: string; }
export interface DeliveryPlan { phases: PlanPhase[]; note: string; }

export function buildDeliveryPlan(uc: UseCase, _eng: EngagementInputs): DeliveryPlan {
  const arch = recArchitecture(uc);
  const data = recDataAccess(uc);
  const test = recTesting(uc);
  const sensitive = uc.dataSensitivity === "pii" || uc.dataSensitivity === "regulated";

  const phases: PlanPhase[] = [
    {
      phase: "1. Business Understanding",
      objective: "Convert the idea into an agreed, measurable decision.",
      activities: ["Run the discovery guide with the sponsor and users", "Quantify the status-quo cost", "Lock the acceptance bar in writing"],
      deliverables: ["Confirmed problem statement", `Acceptance bar: ${uc.acceptanceBar || "to be defined"}`],
      exitCriteria: "Sponsor signs off on a measurable acceptance bar.",
    },
    {
      phase: "2. Data Understanding",
      objective: "Replace assumed data quality with observed data quality.",
      activities: [`Inventory sources (${uc.dataSources || "to be named"})`, "Pull and hand-inspect a real sample", "Confirm access path and ownership"],
      deliverables: ["Data readiness assessment", "Sample-based quality findings"],
      exitCriteria: "Access is proven and a representative sample has been reviewed by hand.",
    },
    {
      phase: "3. Data Preparation",
      objective: "Make the data usable and repeatable to refresh.",
      activities: [data.items[0] || "Define the ingestion/transform layer", sensitive ? "Build a redaction/masking pass for sensitive fields and log it" : "Stand up a repeatable prep pipeline"],
      deliverables: ["Prepared dataset / index", sensitive ? "Redaction log and data map" : "Documented prep pipeline"],
      exitCriteria: "Data flows end-to-end into the pilot without manual steps.",
    },
    {
      phase: "4. Modeling",
      objective: "Build the thinnest version that can be measured.",
      activities: [`Implement ${arch.pattern.toLowerCase()}`, "Version prompts/config like code", arch.hitl.replace(/^Human-in-the-loop checkpoint: /, "Wire the human-in-the-loop checkpoint: ")],
      deliverables: ["Working pilot", "Versioned configuration"],
      exitCriteria: "The core loop runs on real inputs and can be scored.",
    },
    {
      phase: "5. Evaluation",
      objective: "Prove it against the acceptance bar before anyone relies on it.",
      activities: [test.layers[0].body, test.layers[2].body],
      deliverables: ["Golden set", "Evaluation report vs. the acceptance bar", "Failure analysis by category"],
      exitCriteria: "The acceptance bar is met on the golden set and failure modes are understood.",
    },
    {
      phase: "6. Operationalization",
      objective: "Move to production safely, or decide not to.",
      activities: [test.layers[3].body, "Instrument monitoring and the pre-agreed rollback trigger", "Handover and enablement"],
      deliverables: ["Staged-rollout plan", "Monitoring + rollback runbook", "Handover pack"],
      exitCriteria: "Live performance holds against the bar under the rollout gates, or a documented decision to stop.",
    },
  ];
  return { phases, note: "Phase labels follow the CPMAI six-phase structure and iterate rather than run strictly linear; confirm exact wording against your current v7 materials." };
}

/* ------------------------ risk register --------------------- */

export interface Risk { id: string; risk: string; category: string; likelihood: "Low" | "Medium" | "High"; impact: "Low" | "Medium" | "High"; mitigation: string; owner: string; }
export interface RiskRegister { risks: Risk[]; }

export function buildRiskRegister(uc: UseCase): RiskRegister {
  const ev = evaluate(uc);
  const risks: Risk[] = [];
  let n = 1;
  const add = (r: Omit<Risk, "id">) => risks.push({ id: `R${n++}`, ...r });

  if (uc.scores.dataReadiness <= 2)
    add({ risk: "Data is unavailable, inaccessible, or lower quality than assumed", category: "Data", likelihood: uc.scores.dataReadiness <= 1 ? "High" : "Medium", impact: "High", mitigation: "Front-load Data Understanding; prove access and inspect a sample before committing scope; treat prep as the critical path.", owner: "Client data owner" });
  if (uc.scores.risk <= 2 || uc.dataSensitivity === "pii" || uc.dataSensitivity === "regulated")
    add({ risk: "Governance, privacy, or compliance exposure", category: "Governance", likelihood: uc.scores.risk <= 1 ? "High" : "Medium", impact: "High", mitigation: "Apply NIST AI RMF (Govern/Map/Measure/Manage); enforce access controls that flow through to retrieval; redact sensitive fields; keep an audit log.", owner: "Sponsor + compliance" });
  if (!uc.acceptanceBar.trim())
    add({ risk: "Undefined success criteria leading to scope creep and dispute", category: "Scope", likelihood: "High", impact: "High", mitigation: "Do not start build until a measurable acceptance bar is signed off; route changes through change control.", owner: "Practitioner" });
  if (uc.taskShape === "lookup")
    add({ risk: "Confident but fabricated answers erode trust", category: "Quality", likelihood: "Medium", impact: "High", mitigation: "Grounded retrieval with citations; red-team for hallucinated citations; human review calibrated to the bar.", owner: "Practitioner" });
  if (uc.taskShape === "actions")
    add({ risk: "Unintended or injected actions in connected systems", category: "Security", likelihood: "Medium", impact: "High", mitigation: "Approval gate before irreversible actions; per-tool permission scoping; full call logging; prompt-injection testing on tool inputs.", owner: "Practitioner" });
  if (uc.taskVolume === "high" && (uc.latency === "interactive" || uc.latency === "realtime"))
    add({ risk: "Performance or cost does not hold at production volume", category: "Delivery", likelihood: "Medium", impact: "Medium", mitigation: "Load-test at target volume during Evaluation; model per-unit economics before rollout.", owner: "Practitioner" });
  // Always-present baseline risks
  add({ risk: "Low user adoption — the tool works but people don't change how they work", category: "Adoption", likelihood: "Medium", impact: "High", mitigation: "Identify who must change behavior in discovery; involve them in the pilot; measure adoption, not just accuracy.", owner: "Sponsor" });
  add({ risk: "Underlying model or vendor changes shift behavior", category: "Delivery", likelihood: "Low", impact: "Medium", mitigation: "Pin versions; keep the golden set as a regression suite; re-run on any model change.", owner: "Practitioner" });

  if (ev.verdict === "PARK")
    add({ risk: "Case scored PARK — proceeding without addressing weaknesses risks a failed engagement", category: "Governance", likelihood: "High", impact: "High", mitigation: "Resolve the blocking dimensions and re-evaluate before contracting.", owner: "Practitioner" });

  return { risks };
}

/* --------------------- full markdown deliverable ------------ */

const likImp = (r: Risk) => `${r.likelihood}/${r.impact}`;

export function deliveryKitToMarkdown(uc: UseCase, eng: EngagementInputs): string {
  const ev = evaluate(uc);
  const guide = buildDiscoveryGuide(uc);
  const sow = buildSow(uc, eng);
  const plan = buildDeliveryPlan(uc, eng);
  const reg = buildRiskRegister(uc);

  const out: string[] = [];
  out.push(`# Delivery kit — ${uc.name || "AI use case"}`);
  out.push(`_${eng.practitioner || "Lab Intelligence, LLC"} · prepared for ${eng.client || "[client]"} · verdict ${ev.verdict} (${ev.composite.toFixed(0)}/100)_`);
  out.push("");

  out.push("## 1. Discovery guide");
  guide.sections.forEach((s) => {
    out.push(`### ${s.title}`);
    s.questions.forEach((q) => out.push(`- ${q}`));
    out.push("");
  });

  out.push("## 2. Statement of work");
  out.push(`> ${sow.disclaimer}`);
  out.push("");
  sow.sections.forEach((s) => { out.push(`**${s.heading}.** ${s.body}`); out.push(""); });

  out.push("## 3. CPMAI-aligned delivery plan");
  out.push(`_${plan.note}_`);
  out.push("");
  plan.phases.forEach((p) => {
    out.push(`### ${p.phase}`);
    out.push(`*Objective:* ${p.objective}`);
    out.push(`*Activities:* ${p.activities.map((a) => a.replace(/\n/g, " ")).join("; ")}`);
    out.push(`*Deliverables:* ${p.deliverables.join("; ")}`);
    out.push(`*Exit criteria:* ${p.exitCriteria}`);
    out.push("");
  });

  out.push("## 4. Risk register");
  out.push("| ID | Risk | Category | L/I | Mitigation | Owner |");
  out.push("| --- | --- | --- | --- | --- | --- |");
  reg.risks.forEach((r) => out.push(`| ${r.id} | ${r.risk} | ${r.category} | ${likImp(r)} | ${r.mitigation} | ${r.owner} |`));
  out.push("");
  out.push("---");
  out.push("*Generated by AI Use-Case Studio — delivery kit. Heuristic starting points, not guarantees. The SOW is a draft, not legal advice.*");

  return out.join("\n") + "\n";
}
