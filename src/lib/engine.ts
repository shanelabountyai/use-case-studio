/* =============================================================
   AI Use-Case Studio — evaluation engine (pure, deterministic)
   Ported 1:1 from the reference artifact (reference/*.jsx).
   No React, no IO. Everything here is unit-testable.
   ============================================================= */

export type DimKey =
  | "value" | "feasibility" | "dataReadiness" | "risk"
  | "cost" | "timeToValue" | "fit";

export interface Dim { key: DimKey; label: string; w: number; help: string; }

export const DIMS: Dim[] = [
  { key: "value", label: "Business value / impact", w: 25, help: "Size of the problem solved, measured against what the current process costs." },
  { key: "feasibility", label: "Technical feasibility", w: 15, help: "Maturity of the technique for this task shape — think Technology Readiness Levels." },
  { key: "dataReadiness", label: "Data readiness", w: 15, help: "Does the needed data exist, is it accessible, clean and fresh — think Data Readiness Levels." },
  { key: "risk", label: "Risk & governance", w: 15, help: "Higher = better governed. Structured around NIST AI RMF functions: Govern, Map, Measure, Manage." },
  { key: "cost", label: "Cost / effort (inverse)", w: 10, help: "Inverse scale: 5 = low effort and cost, 0 = very expensive to build and run." },
  { key: "timeToValue", label: "Time to value", w: 10, help: "How quickly a first useful version can ship. 5 = weeks, 0 = a year-plus." },
  { key: "fit", label: "Strategic fit", w: 10, help: "Alignment with where the organization is trying to go, not just a local win." },
];

export type Scores = Record<DimKey, number>;
export type Weights = Record<DimKey, number>;
export interface Thresholds { build: number; refine: number; }

export interface UseCase {
  name: string; problem: string; currentCost: string; users: string;
  outcome: string; acceptanceBar: string;
  dataSources: string; dataFormat: string; dataVolume: string;
  dataSensitivity: string; dataFreshness: string;
  latency: string; budget: string; compliance: string; oversight: string;
  taskVolume: string; taskShape: string;
  scores: Scores; weights: Weights; thresholds: Thresholds;
}

export const OPT: Record<string, [string, string][]> = {
  dataFormat: [["documents", "Documents / unstructured text"], ["structured", "Structured (tables, databases)"], ["mixed", "Mixed"], ["none", "Little or none exists yet"]],
  dataVolume: [["small", "Small (fits in a prompt or a few files)"], ["medium", "Medium (hundreds–thousands of items)"], ["large", "Large (tens of thousands +)"]],
  dataSensitivity: [["none", "Public / non-sensitive"], ["internal", "Internal / confidential"], ["pii", "Contains PII"], ["regulated", "Regulated (PHI, financial, etc.)"]],
  dataFreshness: [["static", "Static / rarely changes"], ["periodic", "Updated periodically"], ["realtime", "Changes constantly"]],
  latency: [["batch", "Batch — minutes/hours is fine"], ["interactive", "Interactive — a few seconds"], ["realtime", "Real-time — sub-second"]],
  oversight: [["required", "Human review required on every output"], ["spot-check", "Spot-check / sample review"], ["none", "Fully automated is acceptable"]],
  taskVolume: [["low", "Low — occasional"], ["medium", "Medium — daily"], ["high", "High — constant / at scale"]],
  taskShape: [["lookup", "Answer questions from a knowledge base"], ["classify", "Classify / triage / route items"], ["generate", "Draft or generate content"], ["actions", "Take actions in other systems"], ["process", "Run a multi-step process end-to-end"]],
};

export const optLabel = (group: string, val: string): string =>
  (OPT[group]?.find(([v]) => v === val) || [null, "—"])[1] as string;

export const blankCase = (): UseCase => ({
  name: "", problem: "", currentCost: "", users: "", outcome: "", acceptanceBar: "",
  dataSources: "", dataFormat: "", dataVolume: "", dataSensitivity: "", dataFreshness: "",
  latency: "", budget: "", compliance: "", oversight: "", taskVolume: "", taskShape: "",
  scores: { value: 3, feasibility: 3, dataReadiness: 3, risk: 3, cost: 3, timeToValue: 3, fit: 3 },
  weights: Object.fromEntries(DIMS.map((d) => [d.key, d.w])) as Weights,
  thresholds: { build: 70, refine: 45 },
});

/* ------------------------ scoring -------------------------- */

export function normalizedWeights(weights: Weights): Weights {
  const total = DIMS.reduce((s, d) => s + (Number(weights[d.key]) || 0), 0);
  if (total <= 0) return Object.fromEntries(DIMS.map((d) => [d.key, 100 / DIMS.length])) as Weights;
  return Object.fromEntries(DIMS.map((d) => [d.key, ((Number(weights[d.key]) || 0) / total) * 100])) as Weights;
}

export interface EvalFlag { sev: "critical" | "warn"; text: string; }
export interface Contrib extends Dim { score: number; weight: number; contrib: number; }
export type Verdict = "BUILD" | "REFINE" | "PARK";
export interface Evaluation {
  composite: number; contribs: Contrib[]; flags: EvalFlag[];
  verdict: Verdict; verdictWhy: string;
  impact: number; effort: number; quadrant: string;
}

export function evaluate(uc: UseCase): Evaluation {
  const w = normalizedWeights(uc.weights);
  const T = uc.thresholds || { build: 70, refine: 45 };
  const contribs: Contrib[] = DIMS.map((d) => ({
    ...d, score: uc.scores[d.key], weight: w[d.key],
    contrib: (uc.scores[d.key] / 5) * w[d.key],
  }));
  const composite = contribs.reduce((s, c) => s + c.contrib, 0);

  const flags: EvalFlag[] = [];
  if (uc.scores.dataReadiness <= 1) flags.push({ sev: "critical", text: "Data readiness is critical-low. Without usable data, no architecture choice rescues this — the first workstream is data acquisition and cleanup, not model work." });
  if (uc.scores.risk <= 1) flags.push({ sev: "critical", text: "Risk & governance is critical-low. Ungoverned deployment in this context invites compliance and trust failures; a governance plan (NIST AI RMF: Govern → Map → Measure → Manage) must precede a build." });
  if (uc.scores.dataReadiness === 2) flags.push({ sev: "warn", text: "Data readiness is weak — expect the data-preparation phase to dominate the timeline." });
  if (!uc.acceptanceBar.trim()) flags.push({ sev: "warn", text: "No measurable acceptance bar defined. Without one, 'does it work?' is unanswerable and testing cannot be designed." });
  if (uc.dataSensitivity === "regulated" && uc.oversight === "none") flags.push({ sev: "warn", text: "Regulated data with no human oversight is a governance mismatch — revisit the oversight requirement." });

  const critical = flags.some((f) => f.sev === "critical");
  const sorted = [...contribs].sort((a, b) => b.contrib - a.contrib);
  const weakest = [...contribs].sort((a, b) => a.score - b.score)[0];
  const top2 = sorted.slice(0, 2).map((c) => c.label.toLowerCase());

  let verdict: Verdict; let verdictWhy: string;
  if (composite >= T.build && !critical) {
    verdict = "BUILD";
    verdictWhy = `Composite ${composite.toFixed(0)}/100. The case is carried by ${top2[0]} and ${top2[1]}; the weakest dimension (${weakest.label.toLowerCase()}, ${weakest.score}/5) is manageable rather than blocking. Proceed to a scoped pilot against the acceptance bar.`;
  } else if (composite >= T.refine || (composite >= T.build && critical)) {
    verdict = "REFINE";
    verdictWhy = critical
      ? `Composite ${composite.toFixed(0)}/100 would support a build, but a critical flag caps the verdict: resolve it first, then re-score. Strengths to preserve: ${top2[0]}, ${top2[1]}.`
      : `Composite ${composite.toFixed(0)}/100 — promising but not build-ready. Strongest contributors are ${top2[0]} and ${top2[1]}; the case turns on lifting ${weakest.label.toLowerCase()} (currently ${weakest.score}/5). Fix that specifically, then re-evaluate.`;
  } else {
    verdict = "PARK";
    verdictWhy = `Composite ${composite.toFixed(0)}/100. Even the strongest dimensions (${top2[0]}, ${top2[1]}) don't offset broad weakness — ${weakest.label.toLowerCase()} sits at ${weakest.score}/5. Park it, document why, and revisit if the underlying conditions change.`;
  }

  const impact = uc.scores.value / 5;
  const effort = (5 - uc.scores.cost) / 5;
  const quadrant = impact >= 0.5 && effort < 0.5 ? "Quick win" : impact >= 0.5 ? "Big bet" : effort < 0.5 ? "Fill-in" : "Money pit";

  return { composite, contribs, flags, verdict, verdictWhy, impact, effort, quadrant };
}

/* ------------------ recommendation rules -------------------- */

function thin(uc: UseCase, fields: (keyof UseCase)[], note: string): string | null {
  const missing = fields.filter((f) => !String(uc[f] || "").trim());
  return missing.length ? `Input gap: ${note} (${missing.join(", ")} not provided). The guidance below is correspondingly generic — fill these in to sharpen it.` : null;
}

export interface ArchRec { pattern: string; why: string; runnerUp: string; hitl: string; flag: string | null; }

export function recArchitecture(uc: UseCase): ArchRec {
  const out: ArchRec = { pattern: "", why: "", runnerUp: "", hitl: "", flag: thin(uc, ["taskShape", "dataFormat"], "task shape and data format drive the pattern choice") };
  const docs = uc.dataFormat === "documents" || uc.dataFormat === "mixed";
  switch (uc.taskShape) {
    case "lookup":
      out.pattern = "Retrieval-augmented generation (RAG)";
      out.why = docs
        ? "The task is answering questions from an existing document corpus. RAG keeps answers grounded in retrievable sources — which supports the citation requirement — and stays current as documents change, with no retraining."
        : "The task is knowledge lookup, but the source data isn't document-shaped; a retrieval layer over the structured source (query → summarize) fits better than embedding raw text.";
      out.runnerUp = "Runner-up: fine-tuning a model on the corpus. Tradeoff: baked-in knowledge goes stale as policies change, retraining has recurring cost, and provenance (which document said this?) is lost — a poor fit when citations are required.";
      break;
    case "classify":
      out.pattern = uc.dataVolume === "large" && uc.taskVolume === "high"
        ? "Direct prompting with structured output; evaluate a fine-tuned small model once volume justifies it"
        : "Direct prompting with structured output (fixed label set + confidence)";
      out.why = "Classification against a fixed category set is a constrained task: a well-specified prompt with an enumerated label schema and a confidence threshold covers it without retrieval or agent machinery.";
      out.runnerUp = "Runner-up: fine-tuned classifier. Tradeoff: potentially cheaper per item at very high volume and more consistent, but needs a labeled training set, an MLOps loop, and re-training when categories change — start with prompting, graduate if unit economics demand it.";
      break;
    case "generate":
      out.pattern = docs ? "Direct prompting grounded with RAG over reference material" : "Direct prompting with strong templates and style constraints";
      out.why = docs
        ? "Drafting benefits from grounding: retrieval injects the correct facts and house style, prompting handles the composition."
        : "With no reference corpus, the leverage is in the prompt: explicit structure, tone constraints, and worked examples.";
      out.runnerUp = "Runner-up: fine-tuning for voice/style. Tradeoff: real gains on consistent tone at scale, but it locks in a snapshot and adds training overhead — usually a later optimization, not a starting point.";
      break;
    case "actions":
      out.pattern = "Tool-use (function-calling) agent";
      out.why = "The task requires acting in other systems, which means defined tools with typed inputs, permission scoping per tool, and full logging of every call.";
      out.runnerUp = "Runner-up: orchestrated workflow with LLM steps embedded. Tradeoff: more predictable and auditable, but rigid — better when the action sequence is fixed; the agent pattern wins when the path varies per case.";
      break;
    case "process":
      out.pattern = "Orchestrated multi-step workflow (deterministic pipeline with LLM steps where judgment is needed)";
      out.why = "End-to-end processes want reliability first: deterministic steps for the mechanical parts, LLM calls only where interpretation is required, checkpoints between stages.";
      out.runnerUp = "Runner-up: a fully agentic loop. Tradeoff: more flexible on unusual cases, but harder to test, audit, and bound — for a repeatable business process, orchestration usually wins.";
      break;
    default:
      out.pattern = "Not yet determinable";
      out.why = "Select a task shape in Capture — it's the single strongest signal for the architecture pattern.";
      out.runnerUp = "";
  }
  const strictOversight = uc.oversight === "required";
  const sensitive = uc.dataSensitivity === "pii" || uc.dataSensitivity === "regulated";
  if (uc.taskShape === "actions") out.hitl = "Human-in-the-loop checkpoint: approval gate before any irreversible or external action (payments, sends, record changes). Non-negotiable at launch; relax per-action only with evidence.";
  else if (strictOversight) out.hitl = "Human-in-the-loop checkpoint: every output passes through a review queue before it reaches its destination — the stated oversight requirement makes this a launch condition, not an option.";
  else if (sensitive) out.hitl = "Human-in-the-loop checkpoint: sampled review of outputs touching sensitive fields, plus automated PII-leak checks on every response.";
  else out.hitl = "Human-in-the-loop checkpoint: start with sampled human review calibrated to the acceptance bar; reduce sampling as measured accuracy stabilizes.";
  return out;
}

export const CRISP: [string, (uc: UseCase) => string[]][] = [
  ["Business Understanding", (uc) => [
    `Restate the problem as a decision: is solving “${uc.name || "this"}” worth the effort given the current cost (${uc.currentCost || "not yet quantified — quantify it first"})?`,
    `Lock the acceptance bar with the owner: ${uc.acceptanceBar || "none defined yet — define it before anything else; it anchors every later phase"}.`]],
  ["Data Understanding", (uc) => [
    `Inventory the stated sources (${uc.dataSources || "none listed"}): who owns them, how access is granted, what the real quality is versus the assumed quality.`,
    "Pull a sample and inspect it by hand — data readiness scores routinely drop after first contact with the actual files."]],
  ["Data Preparation", (uc) => [
    uc.dataFormat === "documents" || uc.dataFormat === "mixed"
      ? "Convert, clean and chunk documents; strip boilerplate; decide the metadata that retrieval or routing will filter on."
      : "Define the extraction/transform layer from the structured sources; document field meanings.",
    uc.dataSensitivity === "pii" || uc.dataSensitivity === "regulated"
      ? "Add a redaction/masking pass for sensitive fields before anything reaches a model, and record what was removed."
      : "Establish a repeatable prep pipeline so refreshes aren't manual."]],
  ["Modeling", () => [
    "Build the thinnest version of the chosen architecture that can be scored against the acceptance bar — resist scope until the core loop is measured.",
    "Version prompts and configuration like code; every change should be attributable when a metric moves."]],
  ["Evaluation", (uc) => [
    `Run the golden set against the acceptance bar (${uc.acceptanceBar || "define it"}) before any user sees the system.`,
    "Log failures by category — retrieval miss, reasoning error, formatting — because each category has a different fix."]],
  ["Deployment", (uc) => [
    uc.oversight === "required"
      ? "Ship behind the mandatory review queue; instrument reviewer agreement as an ongoing metric."
      : "Ship in shadow mode first: system runs, humans still decide, outputs are compared silently.",
    "Define the rollback trigger in advance: the metric and threshold that pauses the system."]],
];

export interface DataRec { items: string[]; gov: string[]; gap: string | null; flag: string | null; }

export function recDataAccess(uc: UseCase): DataRec {
  const items: string[] = [];
  const flag = thin(uc, ["dataSources", "dataFormat", "dataSensitivity"], "sources, format and sensitivity drive the access plan");
  if (uc.dataFormat === "documents" || uc.dataFormat === "mixed")
    items.push("Connection pattern: document store → ingestion pipeline → vector index (embeddings) with metadata filters. Sync on the source's update cadence" + (uc.dataFreshness === "realtime" ? " — sources change constantly, so schedule frequent re-indexing and mark result freshness." : "."));
  if (uc.dataFormat === "structured" || uc.dataFormat === "mixed")
    items.push("Connection pattern: read-only database/API access through a service account with least-privilege scope; queries via a defined tool interface (e.g. an MCP connector), never raw credentials in prompts.");
  if (uc.dataFormat === "none")
    items.push("No usable data exists yet — the honest first project is data capture: instrument the current process so it produces the dataset this use case needs. Score data readiness accordingly.");
  if (!uc.dataFormat) items.push("Connection pattern: undetermined until data format is captured.");

  const gov: string[] = [];
  if (uc.dataSensitivity === "pii" || uc.dataSensitivity === "regulated") {
    gov.push("Access control: per-user permissions must flow through to retrieval — the system must never surface a document to someone who couldn't open it directly.");
    gov.push("PII handling: redact or mask sensitive fields at ingestion; log the transformation for lineage.");
    gov.push("Retention: align stored embeddings/logs with the existing retention policy for the underlying records" + (uc.compliance ? ` (stated constraint: ${uc.compliance}).` : "."));
  } else if (uc.dataSensitivity === "internal") {
    gov.push("Access control: internal-only boundary enforced at the connector; audit log of what was retrieved for which query.");
    gov.push("Lineage: every answer traceable to source documents — this is also what makes citations possible.");
  } else {
    gov.push("Baseline: audit logging of retrievals and outputs, and a documented data map, even for non-sensitive sources.");
  }
  const gap = uc.dataFormat && uc.dataFormat !== "none" && !uc.dataSources.trim()
    ? "Gap: a data format is claimed but no concrete sources are named — name them and verify access before scoring data readiness above 2."
    : null;
  return { items, gov, gap, flag };
}

export interface TestRec { layers: { name: string; body: string }[]; flag: string | null; }

export function recTesting(uc: UseCase): TestRec {
  const layers: { name: string; body: string }[] = [];
  const bar = uc.acceptanceBar.trim();
  layers.push({
    name: "Offline evaluation",
    body: `Build a golden set ${uc.dataVolume === "large" ? "(a few hundred labeled items is a reasonable start; grow it with production failures)" : "(even 50–100 carefully chosen items beats none)"} that covers routine cases, known edge cases, and deliberately hard cases. Every candidate change runs against it. ${bar ? `Pass/fail is the stated bar: ${bar}` : "This is blocked until an acceptance bar is defined — the single most important missing input."}`,
  });
  layers.push({
    name: "Scoring method",
    body: uc.taskShape === "classify"
      ? "Classification permits exact-match scoring against labels — cheap, objective, automatable. Track per-category accuracy, not just the aggregate; the aggregate hides the categories that fail."
      : "Free-form outputs need rubric scoring: a written rubric applied by humans on a sample, optionally scaled with LLM-as-judge — but validate the judge against human ratings on a subsample before trusting it, since judge–human agreement is an empirical question, not an assumption.",
  });
  const risks: string[] = [];
  if (uc.dataSensitivity === "pii" || uc.dataSensitivity === "regulated") risks.push("prompts engineered to extract sensitive records");
  if (uc.taskShape === "lookup") risks.push("fabricated answers presented with confident citations");
  if (uc.taskShape === "actions") risks.push("unintended or injected actions (prompt-injection through tool inputs)");
  if (uc.taskShape === "classify") risks.push("systematic misrouting of a minority category");
  layers.push({
    name: "Human review & red-teaming",
    body: `Targeted adversarial testing against this case's identified risks: ${risks.length ? risks.join("; ") : "enumerate the failure modes from the risk score and test each explicitly"}. Findings feed the golden set.`,
  });
  layers.push({
    name: "Staged rollout",
    body: `Shadow mode (system runs, humans decide, outputs compared) → limited release with ${uc.oversight === "required" ? "the mandatory review queue" : "sampled review"} → full rollout only after the acceptance bar holds on live traffic. Pre-commit the rollback trigger.`,
  });
  return { layers, flag: thin(uc, ["acceptanceBar"], "testing is designed backwards from the acceptance bar") };
}

/* --------------------------- CSV ---------------------------- */

export const CSV_COLS = ["id", "savedAt", "name", "verdict", "composite", "quadrant", "value", "feasibility", "dataReadiness", "risk", "cost", "timeToValue", "fit", "problem", "currentCost", "users", "outcome", "acceptanceBar", "dataSources", "dataFormat", "dataVolume", "dataSensitivity", "dataFreshness", "latency", "oversight", "taskVolume", "taskShape", "budget", "compliance"] as const;

const csvCell = (v: unknown): string => {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export interface LibraryRecord { id: string; savedAt: string; uc: UseCase; verdict: Verdict; composite: number; quadrant: string; }

export function recordToCsvRow(rec: LibraryRecord): string {
  const u = rec.uc, s = u.scores;
  const map: Record<string, unknown> = {
    id: rec.id, savedAt: rec.savedAt, name: u.name, verdict: rec.verdict, composite: rec.composite, quadrant: rec.quadrant,
    value: s.value, feasibility: s.feasibility, dataReadiness: s.dataReadiness, risk: s.risk, cost: s.cost, timeToValue: s.timeToValue, fit: s.fit,
    problem: u.problem, currentCost: u.currentCost, users: u.users, outcome: u.outcome, acceptanceBar: u.acceptanceBar,
    dataSources: u.dataSources, dataFormat: u.dataFormat, dataVolume: u.dataVolume, dataSensitivity: u.dataSensitivity, dataFreshness: u.dataFreshness,
    latency: u.latency, oversight: u.oversight, taskVolume: u.taskVolume, taskShape: u.taskShape, budget: u.budget, compliance: u.compliance,
  };
  return CSV_COLS.map((c) => csvCell(map[c])).join(",");
}

export const libraryToCsv = (lib: LibraryRecord[]): string =>
  [CSV_COLS.join(","), ...lib.map(recordToCsvRow)].join("\n");

/* ----------------------- Obsidian --------------------------- */

const yq = (s: unknown) => `"${String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const dateOnly = (iso?: string) => (iso ? String(iso).slice(0, 10) : new Date().toISOString().slice(0, 10));
const slugTag = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function buildObsidianNote(uc: UseCase, savedAt?: string): string {
  const ev = evaluate(uc);
  const arch = recArchitecture(uc);
  const data = recDataAccess(uc);
  const test = recTesting(uc);
  const s = uc.scores;
  const title = uc.name || "Untitled AI use case";
  const fm = ["---",
    `title: ${yq(title)}`, "type: ai-use-case",
    `verdict: ${ev.verdict}`, `composite: ${ev.composite.toFixed(0)}`, `quadrant: ${yq(ev.quadrant)}`,
    `score_value: ${s.value}`, `score_feasibility: ${s.feasibility}`, `score_data_readiness: ${s.dataReadiness}`,
    `score_risk: ${s.risk}`, `score_cost: ${s.cost}`, `score_time_to_value: ${s.timeToValue}`, `score_strategic_fit: ${s.fit}`,
    `architecture: ${yq(arch.pattern)}`, `task_shape: ${yq(optLabel("taskShape", uc.taskShape))}`,
    `data_sensitivity: ${yq(optLabel("dataSensitivity", uc.dataSensitivity))}`, `saved: ${dateOnly(savedAt)}`,
    "tags:", "  - ai-use-case", `  - verdict/${slugTag(ev.verdict)}`, `  - quadrant/${slugTag(ev.quadrant)}`,
    "---"].join("\n");
  const scoreRows = DIMS.map((d) => `| ${d.label} | ${uc.scores[d.key]}/5 |`).join("\n");
  const crisp = CRISP.map(([phase, fn], i) => `### ${i + 1}. ${phase}\n${fn(uc).map((a) => `- ${a}`).join("\n")}`).join("\n\n");
  const testing = test.layers.map((l, i) => `### T${i + 1} · ${l.name}\n${l.body}`).join("\n\n");
  const dataItems = data.items.map((t) => `- ${t}`).join("\n");
  const gov = data.gov.map((t) => `- ${t}`).join("\n");
  const flagsBlock = ev.flags.length ? "> [!warning] Flags\n" + ev.flags.map((f) => `> - ${f.sev === "critical" ? "**CRITICAL** — " : ""}${f.text}`).join("\n") + "\n\n" : "";
  const body = [
    `# ${title}`, "",
    `> [!summary] Verdict: **${ev.verdict}** — composite ${ev.composite.toFixed(0)}/100 · ${ev.quadrant}`,
    `> ${ev.verdictWhy}`, "",
    "**Index:** [[AI Use-Case Register]]", "",
    flagsBlock + "## Problem",
    `${uc.problem || "_Not described._"}${uc.currentCost ? `\n\n**Cost of the status quo:** ${uc.currentCost}` : ""}`, "",
    "## Users & outcome",
    `**Users:** ${uc.users || "_—_"}`, "",
    `**Desired outcome:** ${uc.outcome || "_—_"}`, "",
    `**Acceptance bar:** ${uc.acceptanceBar || "_none defined — define before building_"}`, "",
    "## Evaluation", "| Dimension | Score |", "| --- | --- |", scoreRows, "",
    `Impact × Effort: \`[effort ${ev.effort.toFixed(2)}, impact ${ev.impact.toFixed(2)}]\` → **${ev.quadrant}**`, "",
    "## Recommended architecture",
    `**${arch.pattern}.** ${arch.why}`,
    arch.runnerUp ? `\n${arch.runnerUp}` : "",
    `\n**Human-in-the-loop:** ${arch.hitl}`, "",
    "## Workflow — CRISP-DM", crisp, "",
    "## Data access & governance", dataItems, "", "**Governance layer:**", gov, "",
    "## Testing", testing, "",
    "---",
    "*Generated by AI Use-Case Studio — a heuristic starting point, not a guarantee. Frameworks: CRISP-DM · NIST AI RMF 1.0 · TRL/DRL · Impact×Effort.*",
  ].join("\n");
  return `${fm}\n\n${body}\n`;
}

export function buildIndexEntry(uc: UseCase, savedAt?: string): string {
  const ev = evaluate(uc);
  return `- [[${uc.name || "Untitled AI use case"}]] — **${ev.verdict}** · ${ev.composite.toFixed(0)}/100 · ${ev.quadrant} · _saved ${dateOnly(savedAt)}_`;
}

/* ------------------ reusable prompt builder ----------------- */

export function buildPrompt(uc: UseCase): string {
  const f = (v: string) => (String(v || "").trim() ? v : "[fill in]");
  return `ROLE
You are a senior applied-AI architect and delivery lead. You help me decide whether an AI use case is worth building, and if so, how. Be rigorous, vendor-neutral, and honest about uncertainty. Never invent benchmarks, adoption statistics, or ROI figures; label every estimate as an estimate and show its reasoning. Frame recommendations as defensible heuristics with tradeoffs, not guarantees. If my inputs are too thin to assess a dimension, say so instead of guessing.

MY USE CASE
- Name: ${f(uc.name)}
- Problem / current process and its cost today: ${f(uc.problem)} ${uc.currentCost ? `(cost: ${uc.currentCost})` : ""}
- Primary users and goal: ${f(uc.users)}
- Desired outcome: ${f(uc.outcome)}
- Measurable acceptance bar: ${f(uc.acceptanceBar)}
- Data today — sources: ${f(uc.dataSources)}; format: ${optLabel("dataFormat", uc.dataFormat)}; volume: ${optLabel("dataVolume", uc.dataVolume)}; sensitivity: ${optLabel("dataSensitivity", uc.dataSensitivity)}; freshness: ${optLabel("dataFreshness", uc.dataFreshness)}
- Constraints — latency: ${optLabel("latency", uc.latency)}; budget: ${f(uc.budget)}; compliance: ${f(uc.compliance)}; human oversight: ${optLabel("oversight", uc.oversight)}
- Task volume: ${optLabel("taskVolume", uc.taskVolume)}; task shape: ${optLabel("taskShape", uc.taskShape)}

DO THIS, IN ORDER
1. INTAKE CHECK — List any inputs above that are missing or too vague to assess, and ask me for them before proceeding if they are load-bearing.
2. EVALUATE — Score 0–5 on: business value/impact; technical feasibility; data readiness; risk & governance; cost/effort (inverse — lower effort scores higher); time to value; strategic fit. Justify each score from my inputs in one or two sentences. Compute a weighted composite (default weights 25/15/15/15/10/10/10; I may override). Place the case on an Impact × Effort matrix and name the quadrant. Give a verdict — Build / Refine / Park — with a one-paragraph rationale naming the two or three dimensions that drove it, and flag plainly anything critical (especially weak data readiness or governance).
3. RECOMMEND — Four sections, each with rationale and the main tradeoff of the runner-up option:
   a. Architecture — map my signals to a pattern (direct prompting, RAG, tool-use agent, orchestrated workflow, fine-tuning, or hybrid) and state where a human-in-the-loop checkpoint belongs.
   b. Workflow — walk the six CRISP-DM phases (Business Understanding → Data Understanding → Data Preparation → Modeling → Evaluation → Deployment) turned into concrete next actions for THIS case, not boilerplate.
   c. Data access — what data is needed, where it lives, how to connect it (API, database, document store, vector index, connector), and the governance layer: access control, PII handling, retention, lineage. Name gaps between data needed and data on hand.
   d. Testing — layered plan: offline eval on a golden set; scoring method (exact-match, rubric, or validated LLM-as-judge); targeted human review and red-teaming against my identified risks; staged rollout (shadow → limited → full). Tie every test to my acceptance bar.
4. BRIEF — Close with a plain-language one-page summary a non-technical stakeholder could read: the verdict, why, and the first three actions.

FRAMEWORK NOTES (use accurately; if unsure of a detail, say so)
CRISP-DM for lifecycle; NIST AI RMF 1.0 (Govern, Map, Measure, Manage) for the risk dimension; Technology/Data Readiness Levels as the maturity mental model; Impact × Effort for prioritization. Stay vendor-neutral throughout.`;
}
