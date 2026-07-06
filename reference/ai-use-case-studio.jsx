import React, { useState, useMemo, useRef, useEffect } from "react";

/* ============================================================
   AI USE-CASE STUDIO — decision instrument + persistent library
   Single-file React artifact.
   Persistence: window.storage (Claude artifact datastore) when
   available, else in-session memory. Honest status is shown.
   Export: CSV (with copy fallback) and JSON. No secrets, no
   external network calls from the sandbox.
   ============================================================ */

const C = {
  paper: "#F4F5F2", surface: "#FFFFFF", ink: "#141D27", inkSoft: "#525D68",
  line: "#D9DCD5", blue: "#1D46C8", blueSoft: "#E8EDFB", blueGrid: "#CBD5F0",
  green: "#1D7A4A", greenSoft: "#E5F2EA", amber: "#A97711", amberSoft: "#F7EED9",
  red: "#A63A2B", redSoft: "#F6E7E3",
};
const SANS = '"IBM Plex Sans","Helvetica Neue",Helvetica,Arial,system-ui,sans-serif';
const MONO = '"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

/* ----------------------- dimensions ----------------------- */
const DIMS = [
  { key: "value", label: "Business value / impact", w: 25, help: "Size of the problem solved, measured against what the current process costs." },
  { key: "feasibility", label: "Technical feasibility", w: 15, help: "Maturity of the technique for this task shape — think Technology Readiness Levels." },
  { key: "dataReadiness", label: "Data readiness", w: 15, help: "Does the needed data exist, is it accessible, clean and fresh — think Data Readiness Levels." },
  { key: "risk", label: "Risk & governance", w: 15, help: "Higher = better governed. Structured around NIST AI RMF functions: Govern, Map, Measure, Manage." },
  { key: "cost", label: "Cost / effort (inverse)", w: 10, help: "Inverse scale: 5 = low effort and cost, 0 = very expensive to build and run." },
  { key: "timeToValue", label: "Time to value", w: 10, help: "How quickly a first useful version can ship. 5 = weeks, 0 = a year-plus." },
  { key: "fit", label: "Strategic fit", w: 10, help: "Alignment with where the organization is trying to go, not just a local win." },
];

const blankCase = () => ({
  name: "", problem: "", currentCost: "", users: "", outcome: "", acceptanceBar: "",
  dataSources: "", dataFormat: "", dataVolume: "", dataSensitivity: "", dataFreshness: "",
  latency: "", budget: "", compliance: "", oversight: "", taskVolume: "", taskShape: "",
  scores: { value: 3, feasibility: 3, dataReadiness: 3, risk: 3, cost: 3, timeToValue: 3, fit: 3 },
  weights: Object.fromEntries(DIMS.map((d) => [d.key, d.w])),
  thresholds: { build: 70, refine: 45 },
});

/* ------------------- worked examples ----------------------- */
const EXAMPLES = [
  {
    ...blankCase(),
    name: "Internal policy & knowledge assistant",
    problem: "Employees ask HR and IT the same policy questions repeatedly. The team estimates roughly 30 hours a week (their internal estimate, not audited) goes to answering questions already covered in existing documentation.",
    currentCost: "≈30 staff-hours/week on repeat questions (team's own estimate); slow answers delay onboarding tasks.",
    users: "All employees; HR/IT teams are the secondary beneficiaries.",
    outcome: "Employees self-serve accurate policy answers with citations to the source document.",
    acceptanceBar: "≥90% of answers on a 100-question test set rated correct-with-citation by HR reviewers; zero fabricated policy claims tolerated.",
    dataSources: "Policy PDFs and handbook pages in SharePoint; some FAQ threads in Slack.",
    dataFormat: "documents", dataVolume: "medium", dataSensitivity: "internal", dataFreshness: "periodic",
    latency: "interactive", budget: "Pilot budget approved; small — one builder, one quarter.",
    compliance: "Internal-only; must not expose salary bands or individual HR records.",
    oversight: "spot-check", taskVolume: "high", taskShape: "lookup",
    scores: { value: 4, feasibility: 4, dataReadiness: 3, risk: 4, cost: 4, timeToValue: 4, fit: 4 },
    weights: Object.fromEntries(DIMS.map((d) => [d.key, d.w])),
  },
  {
    ...blankCase(),
    name: "Invoice & document triage",
    problem: "Incoming vendor invoices and contracts arrive in a shared inbox and are sorted by hand into AP categories. Misrouted documents cause payment delays; the team logs the misroutes but hasn't quantified the error rate.",
    currentCost: "1 FTE-equivalent of sorting time; unquantified rework from misrouted documents.",
    users: "Accounts-payable coordinators.",
    outcome: "Documents auto-classified into 8 routing categories with a confidence score; low-confidence items go to a human queue.",
    acceptanceBar: "≥95% routing accuracy on a labeled 500-document held-out set; every sub-threshold prediction routed to human review.",
    dataSources: "12 months of already-sorted documents in the AP drive — a natural labeled dataset, quality unverified.",
    dataFormat: "mixed", dataVolume: "large", dataSensitivity: "pii", dataFreshness: "realtime",
    latency: "batch", budget: "Not yet scoped; expected to be justified by the FTE-equivalent saved.",
    compliance: "Invoices contain vendor bank details and PII; retention rules apply.",
    oversight: "required", taskVolume: "high", taskShape: "classify",
    scores: { value: 3, feasibility: 4, dataReadiness: 4, risk: 3, cost: 3, timeToValue: 3, fit: 3 },
    weights: Object.fromEntries(DIMS.map((d) => [d.key, d.w])),
  },
];

/* --------------------- option labels ----------------------- */
const OPT = {
  dataFormat: [["documents", "Documents / unstructured text"], ["structured", "Structured (tables, databases)"], ["mixed", "Mixed"], ["none", "Little or none exists yet"]],
  dataVolume: [["small", "Small (fits in a prompt or a few files)"], ["medium", "Medium (hundreds–thousands of items)"], ["large", "Large (tens of thousands +)"]],
  dataSensitivity: [["none", "Public / non-sensitive"], ["internal", "Internal / confidential"], ["pii", "Contains PII"], ["regulated", "Regulated (PHI, financial, etc.)"]],
  dataFreshness: [["static", "Static / rarely changes"], ["periodic", "Updated periodically"], ["realtime", "Changes constantly"]],
  latency: [["batch", "Batch — minutes/hours is fine"], ["interactive", "Interactive — a few seconds"], ["realtime", "Real-time — sub-second"]],
  oversight: [["required", "Human review required on every output"], ["spot-check", "Spot-check / sample review"], ["none", "Fully automated is acceptable"]],
  taskVolume: [["low", "Low — occasional"], ["medium", "Medium — daily"], ["high", "High — constant / at scale"]],
  taskShape: [["lookup", "Answer questions from a knowledge base"], ["classify", "Classify / triage / route items"], ["generate", "Draft or generate content"], ["actions", "Take actions in other systems"], ["process", "Run a multi-step process end-to-end"]],
};
const optLabel = (group, val) => (OPT[group].find(([v]) => v === val) || [null, "—"])[1];

/* ------------------------ scoring -------------------------- */
function normalizedWeights(weights) {
  const total = DIMS.reduce((s, d) => s + (Number(weights[d.key]) || 0), 0);
  if (total <= 0) return Object.fromEntries(DIMS.map((d) => [d.key, 100 / DIMS.length]));
  return Object.fromEntries(DIMS.map((d) => [d.key, ((Number(weights[d.key]) || 0) / total) * 100]));
}
function evaluate(uc) {
  const w = normalizedWeights(uc.weights);
  const T = uc.thresholds || { build: 70, refine: 45 };
  const contribs = DIMS.map((d) => ({ ...d, score: uc.scores[d.key], weight: w[d.key], contrib: (uc.scores[d.key] / 5) * w[d.key] }));
  const composite = contribs.reduce((s, c) => s + c.contrib, 0);
  const flags = [];
  if (uc.scores.dataReadiness <= 1) flags.push({ sev: "critical", text: "Data readiness is critical-low. Without usable data, no architecture choice rescues this — the first workstream is data acquisition and cleanup, not model work." });
  if (uc.scores.risk <= 1) flags.push({ sev: "critical", text: "Risk & governance is critical-low. Ungoverned deployment in this context invites compliance and trust failures; a governance plan (NIST AI RMF: Govern → Map → Measure → Manage) must precede a build." });
  if (uc.scores.dataReadiness === 2) flags.push({ sev: "warn", text: "Data readiness is weak — expect the data-preparation phase to dominate the timeline." });
  if (!uc.acceptanceBar.trim()) flags.push({ sev: "warn", text: "No measurable acceptance bar defined. Without one, 'does it work?' is unanswerable and testing cannot be designed." });
  if (uc.dataSensitivity === "regulated" && uc.oversight === "none") flags.push({ sev: "warn", text: "Regulated data with no human oversight is a governance mismatch — revisit the oversight requirement." });
  const critical = flags.some((f) => f.sev === "critical");
  const sorted = [...contribs].sort((a, b) => b.contrib - a.contrib);
  const weakest = [...contribs].sort((a, b) => a.score - b.score)[0];
  const top2 = sorted.slice(0, 2).map((c) => c.label.toLowerCase());
  let verdict, verdictWhy;
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
function thin(uc, fields, note) {
  const missing = fields.filter((f) => !String(uc[f] || "").trim());
  return missing.length ? `Input gap: ${note} (${missing.join(", ")} not provided). The guidance below is correspondingly generic — fill these in to sharpen it.` : null;
}
function recArchitecture(uc) {
  const out = { pattern: "", why: "", runnerUp: "", hitl: "", flag: thin(uc, ["taskShape", "dataFormat"], "task shape and data format drive the pattern choice") };
  const docs = uc.dataFormat === "documents" || uc.dataFormat === "mixed";
  switch (uc.taskShape) {
    case "lookup":
      out.pattern = "Retrieval-augmented generation (RAG)";
      out.why = docs ? "The task is answering questions from an existing document corpus. RAG keeps answers grounded in retrievable sources — which supports the citation requirement — and stays current as documents change, with no retraining." : "The task is knowledge lookup, but the source data isn't document-shaped; a retrieval layer over the structured source (query → summarize) fits better than embedding raw text.";
      out.runnerUp = "Runner-up: fine-tuning a model on the corpus. Tradeoff: baked-in knowledge goes stale as policies change, retraining has recurring cost, and provenance (which document said this?) is lost — a poor fit when citations are required.";
      break;
    case "classify":
      out.pattern = uc.dataVolume === "large" && uc.taskVolume === "high" ? "Direct prompting with structured output; evaluate a fine-tuned small model once volume justifies it" : "Direct prompting with structured output (fixed label set + confidence)";
      out.why = "Classification against a fixed category set is a constrained task: a well-specified prompt with an enumerated label schema and a confidence threshold covers it without retrieval or agent machinery.";
      out.runnerUp = "Runner-up: fine-tuned classifier. Tradeoff: potentially cheaper per item at very high volume and more consistent, but needs a labeled training set, an MLOps loop, and re-training when categories change — start with prompting, graduate if unit economics demand it.";
      break;
    case "generate":
      out.pattern = docs ? "Direct prompting grounded with RAG over reference material" : "Direct prompting with strong templates and style constraints";
      out.why = docs ? "Drafting benefits from grounding: retrieval injects the correct facts and house style, prompting handles the composition." : "With no reference corpus, the leverage is in the prompt: explicit structure, tone constraints, and worked examples.";
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
const CRISP = [
  ["Business Understanding", (uc) => [`Restate the problem as a decision: is solving “${uc.name || "this"}” worth the effort given the current cost (${uc.currentCost || "not yet quantified — quantify it first"})?`, `Lock the acceptance bar with the owner: ${uc.acceptanceBar || "none defined yet — define it before anything else; it anchors every later phase"}.`]],
  ["Data Understanding", (uc) => [`Inventory the stated sources (${uc.dataSources || "none listed"}): who owns them, how access is granted, what the real quality is versus the assumed quality.`, "Pull a sample and inspect it by hand — data readiness scores routinely drop after first contact with the actual files."]],
  ["Data Preparation", (uc) => [uc.dataFormat === "documents" || uc.dataFormat === "mixed" ? "Convert, clean and chunk documents; strip boilerplate; decide the metadata that retrieval or routing will filter on." : "Define the extraction/transform layer from the structured sources; document field meanings.", uc.dataSensitivity === "pii" || uc.dataSensitivity === "regulated" ? "Add a redaction/masking pass for sensitive fields before anything reaches a model, and record what was removed." : "Establish a repeatable prep pipeline so refreshes aren't manual."]],
  ["Modeling", () => ["Build the thinnest version of the chosen architecture that can be scored against the acceptance bar — resist scope until the core loop is measured.", "Version prompts and configuration like code; every change should be attributable when a metric moves."]],
  ["Evaluation", (uc) => [`Run the golden set against the acceptance bar (${uc.acceptanceBar || "define it"}) before any user sees the system.`, "Log failures by category — retrieval miss, reasoning error, formatting — because each category has a different fix."]],
  ["Deployment", (uc) => [uc.oversight === "required" ? "Ship behind the mandatory review queue; instrument reviewer agreement as an ongoing metric." : "Ship in shadow mode first: system runs, humans still decide, outputs are compared silently.", "Define the rollback trigger in advance: the metric and threshold that pauses the system."]],
];
function recDataAccess(uc) {
  const items = [];
  const flag = thin(uc, ["dataSources", "dataFormat", "dataSensitivity"], "sources, format and sensitivity drive the access plan");
  if (uc.dataFormat === "documents" || uc.dataFormat === "mixed") items.push("Connection pattern: document store → ingestion pipeline → vector index (embeddings) with metadata filters. Sync on the source's update cadence" + (uc.dataFreshness === "realtime" ? " — sources change constantly, so schedule frequent re-indexing and mark result freshness." : "."));
  if (uc.dataFormat === "structured" || uc.dataFormat === "mixed") items.push("Connection pattern: read-only database/API access through a service account with least-privilege scope; queries via a defined tool interface (e.g. an MCP connector), never raw credentials in prompts.");
  if (uc.dataFormat === "none") items.push("No usable data exists yet — the honest first project is data capture: instrument the current process so it produces the dataset this use case needs. Score data readiness accordingly.");
  if (!uc.dataFormat) items.push("Connection pattern: undetermined until data format is captured.");
  const gov = [];
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
  const gap = uc.dataFormat && uc.dataFormat !== "none" && !uc.dataSources.trim() ? "Gap: a data format is claimed but no concrete sources are named — name them and verify access before scoring data readiness above 2." : null;
  return { items, gov, gap, flag };
}
function recTesting(uc) {
  const layers = [];
  const bar = uc.acceptanceBar.trim();
  layers.push({ name: "Offline evaluation", body: `Build a golden set ${uc.dataVolume === "large" ? "(a few hundred labeled items is a reasonable start; grow it with production failures)" : "(even 50–100 carefully chosen items beats none)"} that covers routine cases, known edge cases, and deliberately hard cases. Every candidate change runs against it. ${bar ? `Pass/fail is the stated bar: ${bar}` : "This is blocked until an acceptance bar is defined — the single most important missing input."}` });
  layers.push({ name: "Scoring method", body: uc.taskShape === "classify" ? "Classification permits exact-match scoring against labels — cheap, objective, automatable. Track per-category accuracy, not just the aggregate; the aggregate hides the categories that fail." : "Free-form outputs need rubric scoring: a written rubric applied by humans on a sample, optionally scaled with LLM-as-judge — but validate the judge against human ratings on a subsample before trusting it, since judge–human agreement is an empirical question, not an assumption." });
  const risks = [];
  if (uc.dataSensitivity === "pii" || uc.dataSensitivity === "regulated") risks.push("prompts engineered to extract sensitive records");
  if (uc.taskShape === "lookup") risks.push("fabricated answers presented with confident citations");
  if (uc.taskShape === "actions") risks.push("unintended or injected actions (prompt-injection through tool inputs)");
  if (uc.taskShape === "classify") risks.push("systematic misrouting of a minority category");
  layers.push({ name: "Human review & red-teaming", body: `Targeted adversarial testing against this case's identified risks: ${risks.length ? risks.join("; ") : "enumerate the failure modes from the risk score and test each explicitly"}. Findings feed the golden set.` });
  layers.push({ name: "Staged rollout", body: `Shadow mode (system runs, humans decide, outputs compared) → limited release with ${uc.oversight === "required" ? "the mandatory review queue" : "sampled review"} → full rollout only after the acceptance bar holds on live traffic. Pre-commit the rollback trigger.` });
  return { layers, flag: thin(uc, ["acceptanceBar"], "testing is designed backwards from the acceptance bar") };
}

/* ------------------ reusable prompt builder ----------------- */
function buildPrompt(uc) {
  const f = (v) => (String(v || "").trim() ? v : "[fill in]");
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

/* ----------------------- Obsidian --------------------------- */
const yq = (s) => `"${String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const dateOnly = (iso) => (iso ? String(iso).slice(0, 10) : new Date().toISOString().slice(0, 10));
const slugTag = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function buildObsidianNote(uc, savedAt) {
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
function buildIndexEntry(uc, savedAt) {
  const ev = evaluate(uc);
  return `- [[${uc.name || "Untitled AI use case"}]] — **${ev.verdict}** · ${ev.composite.toFixed(0)}/100 · ${ev.quadrant} · _saved ${dateOnly(savedAt)}_`;
}
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

function buildRegister(library) {
  const groups = {};
  library.forEach((r) => { (groups[r.verdict] || (groups[r.verdict] = [])).push(r); });
  const section = (label, key) => {
    const rows = (groups[key] || []).slice().sort((a, b) => b.composite - a.composite).map((r) => `- [[${r.uc.name || "Untitled AI use case"}]] — ${r.composite}/100 · ${r.quadrant}`);
    return `## ${label}\n${rows.length ? rows.join("\n") : "_none_"}`;
  };
  const fm = ["---", `title: "AI Use-Case Register"`, "type: ai-use-case-index", "tags:", "  - ai-use-case", "  - moc", "---"].join("\n");
  const liveTable = `${FENCE}base\n${BASE_PORTFOLIO_YAML}\n${FENCE}`;
  return `${fm}\n\n# AI Use-Case Register\n\nA running index of evaluated AI use cases. Each entry links to its own note. The table below is live (Obsidian Bases 1.9+) and fills itself from note properties; the grouped links beneath are a plain-Markdown fallback.\n\n${liveTable}\n\n${section("Build", "BUILD")}\n\n${section("Refine", "REFINE")}\n\n${section("Park", "PARK")}\n`;
}

/* ---------------------- persistence ------------------------ */
const LIBRARY_KEY = "usecase-library";
const hasStore = typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
const genId = () => `uc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

async function loadLibrary() {
  if (!hasStore) return [];
  try { const r = await window.storage.get(LIBRARY_KEY); return r && r.value ? JSON.parse(r.value) : []; }
  catch { return []; } // a missing key throws; treat as empty
}
async function persistLibrary(lib) {
  if (!hasStore) return false;
  try { const r = await window.storage.set(LIBRARY_KEY, JSON.stringify(lib)); return !!r; }
  catch { return false; }
}

/* -------------------------- CSV ---------------------------- */
const CSV_COLS = ["id", "savedAt", "name", "verdict", "composite", "quadrant", "value", "feasibility", "dataReadiness", "risk", "cost", "timeToValue", "fit", "problem", "currentCost", "users", "outcome", "acceptanceBar", "dataSources", "dataFormat", "dataVolume", "dataSensitivity", "dataFreshness", "latency", "oversight", "taskVolume", "taskShape", "budget", "compliance"];
const csvCell = (v) => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function recordToCsvRow(rec) {
  const u = rec.uc, s = u.scores;
  const map = { id: rec.id, savedAt: rec.savedAt, name: u.name, verdict: rec.verdict, composite: rec.composite, quadrant: rec.quadrant, value: s.value, feasibility: s.feasibility, dataReadiness: s.dataReadiness, risk: s.risk, cost: s.cost, timeToValue: s.timeToValue, fit: s.fit, problem: u.problem, currentCost: u.currentCost, users: u.users, outcome: u.outcome, acceptanceBar: u.acceptanceBar, dataSources: u.dataSources, dataFormat: u.dataFormat, dataVolume: u.dataVolume, dataSensitivity: u.dataSensitivity, dataFreshness: u.dataFreshness, latency: u.latency, oversight: u.oversight, taskVolume: u.taskVolume, taskShape: u.taskShape, budget: u.budget, compliance: u.compliance };
  return CSV_COLS.map((c) => csvCell(map[c])).join(",");
}
const libraryToCsv = (lib) => [CSV_COLS.join(","), ...lib.map(recordToCsvRow)].join("\n");

function download(filename, text, mime) {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    return true;
  } catch { return false; }
}

/* ----------------------- UI atoms --------------------------- */
const Eyebrow = ({ children }) => (<div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: C.blue }} className="uppercase mb-1">{children}</div>);
const Field = ({ label, help, children }) => (<label className="block mb-4"><span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", color: C.inkSoft }} className="uppercase block mb-1">{label}</span>{children}{help && <span className="block mt-1 text-xs" style={{ color: C.inkSoft }}>{help}</span>}</label>);
const inputStyle = { fontFamily: SANS, fontSize: 14, color: C.ink, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 2, width: "100%", padding: "8px 10px", outline: "none" };
const TextIn = (p) => <input {...p} style={inputStyle} />;
const AreaIn = (p) => <textarea rows={3} {...p} style={{ ...inputStyle, resize: "vertical" }} />;
const SelIn = ({ group, value, onChange }) => (<select value={value} onChange={onChange} style={inputStyle}><option value="">— select —</option>{OPT[group].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>);
const Flag = ({ sev, children }) => (<div className="flex gap-2 items-start p-3 mb-2" style={{ background: sev === "critical" ? C.redSoft : C.amberSoft, borderLeft: `3px solid ${sev === "critical" ? C.red : C.amber}` }}><span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", color: sev === "critical" ? C.red : C.amber, whiteSpace: "nowrap", paddingTop: 2 }} className="uppercase">{sev === "critical" ? "critical" : "flag"}</span><span className="text-sm" style={{ color: C.ink }}>{children}</span></div>);
const btn = (bg, fg, border) => ({ fontFamily: MONO, fontSize: 12, letterSpacing: "0.04em", background: bg, color: fg, border: border || "none", cursor: "pointer", padding: "8px 14px" });

/* ---------------------- matrix (SVG) ------------------------ */
function Matrix({ impact, effort, quadrant, name }) {
  const S = 300, P = 34;
  const x = P + effort * (S - 2 * P);
  const y = S - P - impact * (S - 2 * P);
  const grid = [0.25, 0.5, 0.75];
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="w-full" style={{ maxWidth: 360, background: C.blueSoft, border: `1px solid ${C.blueGrid}` }} role="img" aria-label={`Impact–effort matrix: ${name || "use case"} in the ${quadrant} quadrant`}>
      {grid.map((g) => (<g key={g}><line x1={P + g * (S - 2 * P)} y1={P} x2={P + g * (S - 2 * P)} y2={S - P} stroke={C.blueGrid} strokeWidth={g === 0.5 ? 1.2 : 0.6} strokeDasharray={g === 0.5 ? "" : "2 3"} /><line x1={P} y1={P + g * (S - 2 * P)} x2={S - P} y2={P + g * (S - 2 * P)} stroke={C.blueGrid} strokeWidth={g === 0.5 ? 1.2 : 0.6} strokeDasharray={g === 0.5 ? "" : "2 3"} /></g>))}
      <rect x={P} y={P} width={S - 2 * P} height={S - 2 * P} fill="none" stroke={C.blue} strokeWidth="1" />
      {[["QUICK WIN", P + 6, P + 14], ["BIG BET", S - P - 6, P + 14, "end"], ["FILL-IN", P + 6, S - P - 8], ["MONEY PIT", S - P - 6, S - P - 8, "end"]].map(([t, tx, ty, a]) => (<text key={t} x={tx} y={ty} textAnchor={a || "start"} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em" }} fill={quadrant.toUpperCase() === t ? C.blue : "#8FA0C9"}>{t}</text>))}
      <line x1={x} y1={P} x2={x} y2={S - P} stroke={C.blue} strokeWidth="0.5" strokeDasharray="3 3" />
      <line x1={P} y1={y} x2={S - P} y2={y} stroke={C.blue} strokeWidth="0.5" strokeDasharray="3 3" />
      <circle cx={x} cy={y} r="6" fill={C.blue} /><circle cx={x} cy={y} r="10" fill="none" stroke={C.blue} strokeWidth="1" />
      <text x={S / 2} y={S - 8} textAnchor="middle" style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em" }} fill={C.inkSoft}>EFFORT →</text>
      <text x={12} y={S / 2} textAnchor="middle" transform={`rotate(-90 12 ${S / 2})`} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em" }} fill={C.inkSoft}>IMPACT →</text>
      <text x={x} y={y - 16} textAnchor="middle" style={{ fontFamily: MONO, fontSize: 9 }} fill={C.blue}>[{effort.toFixed(2)}, {impact.toFixed(2)}]</text>
    </svg>
  );
}

/* ------------------------- app ------------------------------ */
const STAGES = ["Capture", "Evaluate", "Recommend", "Export", "Library"];

export default function App() {
  const [uc, setUc] = useState(EXAMPLES[0]);
  const [stage, setStage] = useState(0);
  const [showcase, setShowcase] = useState(false);
  const [copied, setCopied] = useState(false);
  const [library, setLibrary] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [storeStatus, setStoreStatus] = useState("loading"); // loading | connected | memory
  const [toast, setToast] = useState("");
  const [csvOpen, setCsvOpen] = useState(false);
  const [wireOpen, setWireOpen] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    let live = true;
    (async () => {
      if (!hasStore) { if (live) setStoreStatus("memory"); return; }
      const lib = await loadLibrary();
      if (live) { setLibrary(lib); setStoreStatus("connected"); }
    })();
    return () => { live = false; };
  }, []);

  const ev = useMemo(() => evaluate(uc), [uc]);
  const arch = useMemo(() => recArchitecture(uc), [uc]);
  const data = useMemo(() => recDataAccess(uc), [uc]);
  const test = useMemo(() => recTesting(uc), [uc]);
  const prompt = useMemo(() => buildPrompt(uc), [uc]);

  const set = (k) => (e) => setUc({ ...uc, [k]: e.target.value });
  const setScore = (k, v) => setUc({ ...uc, scores: { ...uc.scores, [k]: Number(v) } });
  const setWeight = (k, v) => setUc({ ...uc, weights: { ...uc.weights, [k]: Number(v) } });
  const setThreshold = (k, v) => setUc({ ...uc, thresholds: { ...(uc.thresholds || { build: 70, refine: 45 }), [k]: Number(v) } });
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 1800); };

  async function saveToLibrary() {
    const id = currentId || genId();
    const rec = { id, savedAt: new Date().toISOString(), uc: JSON.parse(JSON.stringify(uc)), verdict: ev.verdict, composite: Number(ev.composite.toFixed(1)), quadrant: ev.quadrant };
    const next = currentId ? library.map((r) => (r.id === id ? rec : r)) : [rec, ...library];
    setLibrary(next); setCurrentId(id);
    if (hasStore) { const ok = await persistLibrary(next); flash(ok ? (currentId ? "Updated in library" : "Saved to library") : "Saved this session — store write failed"); }
    else flash("Saved this session only (no persistent store here)");
  }
  function loadRecord(rec) {
    setUc({ ...blankCase(), ...rec.uc, scores: { ...blankCase().scores, ...(rec.uc.scores || {}) }, weights: { ...blankCase().weights, ...(rec.uc.weights || {}) }, thresholds: { ...blankCase().thresholds, ...(rec.uc.thresholds || {}) } });
    setCurrentId(rec.id); setStage(1); setShowcase(false); flash(`Loaded “${rec.uc.name || "untitled"}”`);
  }
  async function deleteRecord(id) {
    const next = library.filter((r) => r.id !== id);
    setLibrary(next); if (currentId === id) setCurrentId(null);
    if (hasStore) await persistLibrary(next);
    flash("Removed");
  }
  const newCase = () => { setUc(blankCase()); setCurrentId(null); setStage(0); flash("New blank case"); };

  const doExportJson = () => { if (!download(`${(uc.name || "use-case").replace(/\s+/g, "-").toLowerCase()}.json`, JSON.stringify(uc, null, 2), "application/json")) flash("Download blocked — use Copy instead"); };
  const doImport = (e) => {
    const fl = e.target.files && e.target.files[0]; if (!fl) return;
    const r = new FileReader();
    r.onload = () => { try { const p = JSON.parse(r.result); setUc({ ...blankCase(), ...p, scores: { ...blankCase().scores, ...(p.scores || {}) }, weights: { ...blankCase().weights, ...(p.weights || {}) }, thresholds: { ...blankCase().thresholds, ...(p.thresholds || {}) } }); setCurrentId(null); flash("Imported"); } catch { alert("That file isn't valid JSON from this tool."); } };
    r.readAsText(fl); e.target.value = "";
  };
  const currentCsv = () => libraryToCsv([{ id: currentId || "(unsaved)", savedAt: new Date().toISOString(), uc, verdict: ev.verdict, composite: Number(ev.composite.toFixed(1)), quadrant: ev.quadrant }]);
  const libCsv = () => (library.length ? libraryToCsv(library) : currentCsv());
  const doCopy = async (text, label) => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); flash(`${label} copied`); } catch { flash("Clipboard blocked — select the text manually"); } };
  const obsSavedAt = (library.find((r) => r.id === currentId) || {}).savedAt;
  const obsNote = () => buildObsidianNote(uc, obsSavedAt);
  const obsEntry = () => buildIndexEntry(uc, obsSavedAt);
  const obsRegister = () => buildRegister(library.length ? library : [{ id: currentId || "current", savedAt: obsSavedAt || new Date().toISOString(), uc, verdict: ev.verdict, composite: Number(ev.composite.toFixed(1)), quadrant: ev.quadrant }]);
  const safeFile = (n) => String(n || "use-case").replace(/[\\/:*?"<>|]+/g, "-").trim();

  const vColor = ev.verdict === "BUILD" ? C.green : ev.verdict === "REFINE" ? C.amber : C.red;
  const vBg = ev.verdict === "BUILD" ? C.greenSoft : ev.verdict === "REFINE" ? C.amberSoft : C.redSoft;
  const wTotal = DIMS.reduce((s, d) => s + (Number(uc.weights[d.key]) || 0), 0);

  const StoreChip = () => {
    const map = { loading: ["#8FA0C9", "checking store…"], connected: [C.green, "persistent store: on"], memory: [C.amber, "session memory only"] };
    const [c, t] = map[storeStatus];
    return <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", color: c, border: `1px solid ${c}`, padding: "2px 6px", borderRadius: 2 }} className="uppercase">{t}</span>;
  };

  const SaveBar = () => (
    <div className="flex gap-2 items-center flex-wrap mb-4">
      <button onClick={saveToLibrary} style={btn(C.blue, "#fff")}>{currentId ? "UPDATE IN LIBRARY" : "SAVE TO LIBRARY"}</button>
      {currentId && <button onClick={newCase} style={btn("transparent", C.inkSoft, `1px dashed ${C.inkSoft}`)}>NEW CASE</button>}
      <StoreChip />
      {currentId && <span style={{ fontFamily: MONO, fontSize: 10, color: C.inkSoft }}>editing a saved record</span>}
    </div>
  );

  const VerdictCard = ({ withSave }) => (
    <div className="p-5 mb-5" style={{ background: vBg, border: `1px solid ${vColor}` }}>
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600, letterSpacing: "0.06em", color: vColor }}>{ev.verdict}</span>
        <span style={{ fontFamily: MONO, fontSize: 13, color: C.inkSoft }}>composite {ev.composite.toFixed(0)}/100 · {ev.quadrant.toLowerCase()}</span>
      </div>
      <p className="text-sm mt-2 leading-relaxed" style={{ color: C.ink }}>{ev.verdictWhy}</p>
      {withSave && <div className="mt-3"><button onClick={saveToLibrary} style={btn(vColor, "#fff")}>{currentId ? "UPDATE IN LIBRARY" : "SAVE TO LIBRARY"}</button></div>}
    </div>
  );

  const PanelShell = ({ n, title, children }) => (
    <section className="mb-6 p-5" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
      <div className="flex items-baseline gap-3 mb-3"><span style={{ fontFamily: MONO, fontSize: 11, color: C.blue }}>{n}</span><h3 style={{ fontFamily: SANS, fontWeight: 600, fontSize: 16, color: C.ink }}>{title}</h3></div>
      {children}
    </section>
  );

  /* -------- showcase brief -------- */
  if (showcase) {
    return (
      <div style={{ background: C.paper, minHeight: "100vh", fontFamily: SANS, color: C.ink }} className="px-4 py-8 sm:px-8">
        <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600;700&display=swap');
@media print { .no-print{display:none !important;} @page{margin:14mm;} html,body{background:#fff !important;} *{-webkit-print-color-adjust:exact;print-color-adjust:exact;} }`}</style>
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-start mb-8 flex-wrap gap-3">
            <div><Eyebrow>AI use-case brief</Eyebrow><h1 style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.15 }}>{uc.name || "Untitled use case"}</h1></div>
            <div className="flex gap-2 no-print">
              <button onClick={() => window.print()} style={btn(C.blue, "#fff")}>SAVE AS PDF</button>
              <button onClick={() => setShowcase(false)} style={btn("transparent", C.ink, `1px solid ${C.ink}`)}>PRACTITIONER VIEW</button>
            </div>
          </div>
          <p className="no-print text-xs mb-5" style={{ color: C.inkSoft, fontFamily: MONO }}>SAVE AS PDF opens your browser's print dialog → choose “Save as PDF.” If the dialog doesn't appear inside the embedded view, open the artifact in its own window first.</p>
          <VerdictCard />
          {ev.flags.filter((f) => f.sev === "critical").map((f, i) => <Flag key={i} sev="critical">{f.text}</Flag>)}
          <div className="grid sm:grid-cols-2 gap-6 my-6 items-start">
            <div><Eyebrow>Where it sits</Eyebrow><Matrix impact={ev.impact} effort={ev.effort} quadrant={ev.quadrant} name={uc.name} /></div>
            <div>
              <Eyebrow>The problem</Eyebrow><p className="text-sm leading-relaxed mb-4">{uc.problem || "Not yet described."}</p>
              <Eyebrow>What success looks like</Eyebrow><p className="text-sm leading-relaxed">{uc.outcome || "Not yet described."} {uc.acceptanceBar && <span>Measured as: {uc.acceptanceBar}</span>}</p>
            </div>
          </div>
          <Eyebrow>The recommended approach, in plain terms</Eyebrow>
          <p className="text-sm leading-relaxed mb-3"><strong>{arch.pattern}.</strong> {arch.why}</p>
          <p className="text-sm leading-relaxed mb-3">{arch.hitl}</p>
          <p className="text-sm leading-relaxed mb-6">Before anyone trusts it, it gets tested the boring way: a scored test set, adversarial probing of the specific risks this case carries, and a staged release where humans stay in control until the numbers earn otherwise. Every claim here traces to the inputs on the practitioner side — nothing is a projected ROI figure or an industry statistic.</p>
          <Eyebrow>First three actions</Eyebrow>
          <ol className="text-sm leading-relaxed list-decimal ml-5 mb-10">
            <li className="mb-1">{uc.acceptanceBar ? `Confirm the acceptance bar with the owner: ${uc.acceptanceBar}` : "Define a measurable acceptance bar — nothing else is testable without it."}</li>
            <li className="mb-1">{uc.dataSources ? `Verify hands-on access to the stated data (${uc.dataSources}) and inspect a real sample.` : "Identify and verify access to the data this depends on."}</li>
            <li>Build the thinnest testable version of the {arch.pattern.toLowerCase()} and score it against the bar.</li>
          </ol>
          <div className="pt-4 text-xs" style={{ borderTop: `1px solid ${C.line}`, color: C.inkSoft, fontFamily: MONO }}>Frameworks: CRISP-DM · NIST AI RMF 1.0 · TRL/DRL · Impact×Effort — vendor-neutral throughout.</div>
        </div>
      </div>
    );
  }

  /* -------- practitioner -------- */
  return (
    <div style={{ background: C.paper, minHeight: "100vh", fontFamily: SANS, color: C.ink }} className="px-4 py-6 sm:px-8">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600;700&display=swap');
        input[type=range]{accent-color:${C.blue};}
        button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid ${C.blue};outline-offset:2px;}`}</style>
      <div className="max-w-3xl mx-auto">

        <header className="mb-6">
          <div className="flex justify-between items-start flex-wrap gap-3">
            <div>
              <Eyebrow>Lab Intelligence · decision instrument</Eyebrow>
              <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>AI Use-Case Studio</h1>
              <p className="text-sm mt-1" style={{ color: C.inkSoft }}>From raw idea to a defensible build / refine / park decision — saved to a library you can export.</p>
            </div>
            <div className="flex gap-2 items-center"><StoreChip /><button onClick={() => setShowcase(true)} style={btn(C.ink, C.paper)}>SHOWCASE BRIEF</button></div>
          </div>
          <div className="flex gap-2 mt-4 flex-wrap items-center">
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", color: C.inkSoft }} className="uppercase">Load example:</span>
            {EXAMPLES.map((ex, i) => (<button key={i} onClick={() => { setUc(JSON.parse(JSON.stringify(ex))); setCurrentId(null); setStage(0); }} style={btn(C.surface, C.ink, `1px solid ${C.line}`)}>{ex.name}</button>))}
            <button onClick={newCase} style={btn("transparent", C.inkSoft, `1px dashed ${C.inkSoft}`)}>blank</button>
          </div>
        </header>

        <nav className="flex mb-6 overflow-x-auto" style={{ borderBottom: `1px solid ${C.line}` }} aria-label="Stages">
          {STAGES.map((s, i) => (
            <button key={s} onClick={() => setStage(i)} className="px-3 sm:px-4 py-2 text-sm whitespace-nowrap" style={{ fontFamily: MONO, letterSpacing: "0.04em", background: "transparent", border: "none", borderBottom: stage === i ? `2px solid ${C.blue}` : "2px solid transparent", color: stage === i ? C.blue : C.inkSoft, cursor: "pointer", fontWeight: stage === i ? 600 : 400 }}>
              {String(i + 1).padStart(2, "0")} {s}{i === 4 && library.length ? ` (${library.length})` : ""}
            </button>
          ))}
        </nav>

        {/* 01 CAPTURE */}
        {stage === 0 && (
          <div>
            <PanelShell n="01·A" title="The problem">
              <Field label="Use case name"><TextIn value={uc.name} onChange={set("name")} placeholder="e.g. Contract clause triage" /></Field>
              <Field label="Problem / current process" help="What happens today, and what it costs — time, money, error rate. Label estimates as estimates."><AreaIn value={uc.problem} onChange={set("problem")} /></Field>
              <Field label="Cost of the status quo"><TextIn value={uc.currentCost} onChange={set("currentCost")} placeholder="e.g. ≈10 hrs/week (team estimate)" /></Field>
              <Field label="Primary users & their goal"><TextIn value={uc.users} onChange={set("users")} /></Field>
              <Field label="Desired outcome"><AreaIn value={uc.outcome} onChange={set("outcome")} /></Field>
              <Field label="Measurable acceptance bar" help="The most load-bearing field: how you'll know it works. A number, a threshold, a judge."><TextIn value={uc.acceptanceBar} onChange={set("acceptanceBar")} placeholder="e.g. ≥95% accuracy on a 200-item labeled set" /></Field>
            </PanelShell>
            <PanelShell n="01·B" title="Data that exists today">
              <Field label="Sources"><TextIn value={uc.dataSources} onChange={set("dataSources")} placeholder="e.g. SharePoint policy library; AP shared drive" /></Field>
              <div className="grid sm:grid-cols-2 gap-x-5">
                <Field label="Format"><SelIn group="dataFormat" value={uc.dataFormat} onChange={set("dataFormat")} /></Field>
                <Field label="Volume"><SelIn group="dataVolume" value={uc.dataVolume} onChange={set("dataVolume")} /></Field>
                <Field label="Sensitivity"><SelIn group="dataSensitivity" value={uc.dataSensitivity} onChange={set("dataSensitivity")} /></Field>
                <Field label="Freshness"><SelIn group="dataFreshness" value={uc.dataFreshness} onChange={set("dataFreshness")} /></Field>
              </div>
            </PanelShell>
            <PanelShell n="01·C" title="Constraints & shape">
              <div className="grid sm:grid-cols-2 gap-x-5">
                <Field label="Latency requirement"><SelIn group="latency" value={uc.latency} onChange={set("latency")} /></Field>
                <Field label="Human oversight"><SelIn group="oversight" value={uc.oversight} onChange={set("oversight")} /></Field>
                <Field label="Task volume"><SelIn group="taskVolume" value={uc.taskVolume} onChange={set("taskVolume")} /></Field>
                <Field label="Task shape" help="The strongest single signal for architecture."><SelIn group="taskShape" value={uc.taskShape} onChange={set("taskShape")} /></Field>
              </div>
              <Field label="Budget reality"><TextIn value={uc.budget} onChange={set("budget")} /></Field>
              <Field label="Compliance / regulatory constraints"><TextIn value={uc.compliance} onChange={set("compliance")} /></Field>
            </PanelShell>
            <div className="flex justify-between"><SaveBar /><button onClick={() => setStage(1)} style={btn(C.blue, "#fff")}>EVALUATE →</button></div>
          </div>
        )}

        {/* 02 EVALUATE */}
        {stage === 1 && (
          <div>
            <VerdictCard withSave />
            {ev.flags.length > 0 && <div className="mb-5">{ev.flags.map((f, i) => <Flag key={i} sev={f.sev}>{f.text}</Flag>)}</div>}
            <div className="grid md:grid-cols-2 gap-6 items-start">
              <PanelShell n="02·A" title="Dimension scores & weights">
                {DIMS.map((d) => (
                  <div key={d.key} className="mb-4">
                    <div className="flex justify-between items-baseline"><span className="text-sm font-semibold">{d.label}</span><span style={{ fontFamily: MONO, fontSize: 12, color: C.blue }}>{uc.scores[d.key]}/5 · w{normalizedWeights(uc.weights)[d.key].toFixed(0)}%</span></div>
                    <p className="text-xs mb-1" style={{ color: C.inkSoft }}>{d.help}</p>
                    <div className="flex gap-3 items-center">
                      <input type="range" min="0" max="5" step="1" value={uc.scores[d.key]} onChange={(e) => setScore(d.key, e.target.value)} className="flex-1" aria-label={`${d.label} score`} />
                      <input type="number" min="0" max="100" value={uc.weights[d.key]} onChange={(e) => setWeight(d.key, e.target.value)} aria-label={`${d.label} weight`} style={{ ...inputStyle, width: 58, padding: "3px 6px", fontFamily: MONO, fontSize: 12 }} />
                    </div>
                  </div>
                ))}
                <p className="text-xs" style={{ fontFamily: MONO, color: wTotal === 100 ? C.inkSoft : C.amber }}>weights total {wTotal}{wTotal !== 100 ? " — normalized to 100 automatically" : ""}</p>
                <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
                  <div className="flex justify-between items-baseline mb-1"><span className="text-sm font-semibold">Verdict thresholds</span><span style={{ fontFamily: MONO, fontSize: 10, color: C.inkSoft }}>composite cutoffs</span></div>
                  <p className="text-xs mb-2" style={{ color: C.inkSoft }}>Build if composite ≥ Build; Refine if ≥ Refine; otherwise Park. A critical flag still caps at Refine.</p>
                  <div className="flex gap-4 items-center flex-wrap">
                    <label className="flex items-center gap-2 text-sm">Build ≥ <input type="number" min="0" max="100" value={(uc.thresholds || { build: 70, refine: 45 }).build} onChange={(e) => setThreshold("build", e.target.value)} style={{ ...inputStyle, width: 64, padding: "3px 6px", fontFamily: MONO }} /></label>
                    <label className="flex items-center gap-2 text-sm">Refine ≥ <input type="number" min="0" max="100" value={(uc.thresholds || { build: 70, refine: 45 }).refine} onChange={(e) => setThreshold("refine", e.target.value)} style={{ ...inputStyle, width: 64, padding: "3px 6px", fontFamily: MONO }} /></label>
                  </div>
                  {(uc.thresholds || { build: 70, refine: 45 }).build <= (uc.thresholds || { build: 70, refine: 45 }).refine && <p className="text-xs mt-1" style={{ color: C.amber }}>Build cutoff should exceed Refine cutoff, or the Refine band disappears.</p>}
                </div>
              </PanelShell>
              <div>
                <PanelShell n="02·B" title="Impact × Effort"><Matrix impact={ev.impact} effort={ev.effort} quadrant={ev.quadrant} name={uc.name} /><p className="text-xs mt-2" style={{ color: C.inkSoft }}>Impact = business-value score; effort = inverse of the cost/effort score.</p></PanelShell>
                <PanelShell n="02·C" title="What's driving the composite">
                  {[...ev.contribs].sort((a, b) => b.contrib - a.contrib).map((c) => (
                    <div key={c.key} className="flex items-center gap-2 mb-1"><span className="text-xs w-40 shrink-0" style={{ color: C.inkSoft }}>{c.label}</span><div className="flex-1 h-2" style={{ background: C.blueSoft }}><div style={{ width: `${(c.contrib / 25) * 100}%`, maxWidth: "100%", height: "100%", background: C.blue }} /></div><span style={{ fontFamily: MONO, fontSize: 11, color: C.ink }}>{c.contrib.toFixed(1)}</span></div>
                  ))}
                </PanelShell>
              </div>
            </div>
            <div className="flex justify-end"><button onClick={() => setStage(2)} style={btn(C.blue, "#fff")}>RECOMMEND →</button></div>
          </div>
        )}

        {/* 03 RECOMMEND */}
        {stage === 2 && (
          <div>
            <VerdictCard withSave />
            <PanelShell n="03·A" title="Architecture">
              {arch.flag && <Flag sev="warn">{arch.flag}</Flag>}
              <p className="text-sm mb-2"><span style={{ fontFamily: MONO, fontSize: 11, color: C.blue }} className="uppercase mr-2">Pattern</span><strong>{arch.pattern}</strong></p>
              <p className="text-sm leading-relaxed mb-3">{arch.why}</p>
              {arch.runnerUp && <p className="text-sm leading-relaxed mb-3" style={{ color: C.inkSoft }}>{arch.runnerUp}</p>}
              <p className="text-sm leading-relaxed p-3" style={{ background: C.blueSoft }}>{arch.hitl}</p>
            </PanelShell>
            <PanelShell n="03·B" title="Workflow — CRISP-DM, made concrete">
              <p className="text-xs mb-3" style={{ color: C.inkSoft }}>Six CRISP-DM phases translated into next actions for this case. Phases iterate; this is a loop, not a waterfall.</p>
              {CRISP.map(([phase, fn], i) => (<div key={phase} className="mb-3"><div className="flex items-baseline gap-2"><span style={{ fontFamily: MONO, fontSize: 10, color: C.blue }}>P{i + 1}</span><span className="text-sm font-semibold">{phase}</span></div><ul className="ml-6 mt-1">{fn(uc).map((a, j) => <li key={j} className="text-sm leading-relaxed list-disc mb-1">{a}</li>)}</ul></div>))}
            </PanelShell>
            <PanelShell n="03·C" title="Data access & governance">
              {data.flag && <Flag sev="warn">{data.flag}</Flag>}
              {data.gap && <Flag sev="warn">{data.gap}</Flag>}
              <ul className="ml-5 mb-3">{data.items.map((t, i) => <li key={i} className="text-sm leading-relaxed list-disc mb-2">{t}</li>)}</ul>
              <Eyebrow>Governance layer</Eyebrow>
              <ul className="ml-5">{data.gov.map((t, i) => <li key={i} className="text-sm leading-relaxed list-disc mb-2">{t}</li>)}</ul>
            </PanelShell>
            <PanelShell n="03·D" title="Testing — layered, tied to the acceptance bar">
              {test.flag && <Flag sev="warn">{test.flag}</Flag>}
              {test.layers.map((l, i) => (<div key={i} className="mb-3"><span style={{ fontFamily: MONO, fontSize: 11, color: C.blue }} className="uppercase">{`T${i + 1} · ${l.name}`}</span><p className="text-sm leading-relaxed mt-1">{l.body}</p></div>))}
            </PanelShell>
            <div className="flex justify-end"><button onClick={() => setStage(3)} style={btn(C.blue, "#fff")}>EXPORT →</button></div>
          </div>
        )}

        {/* 04 EXPORT */}
        {stage === 3 && (
          <div>
            <PanelShell n="04·A" title="One-page brief"><p className="text-sm leading-relaxed mb-3">The Showcase view renders this analysis as a clean, client-ready brief — same numbers, plain language.</p><button onClick={() => setShowcase(true)} style={btn(C.ink, C.paper)}>OPEN SHOWCASE BRIEF</button></PanelShell>
            <PanelShell n="04·B" title="This case — save & export">
              <SaveBar />
              <div className="flex gap-2 flex-wrap">
                <button onClick={doExportJson} style={btn(C.blue, "#fff")}>DOWNLOAD JSON</button>
                <button onClick={() => fileRef.current && fileRef.current.click()} style={btn(C.surface, C.ink, `1px solid ${C.ink}`)}>IMPORT JSON</button>
                <button onClick={() => doCopy(currentCsv(), "Row CSV")} style={btn(C.surface, C.ink, `1px solid ${C.ink}`)}>COPY THIS ROW (CSV)</button>
                <input ref={fileRef} type="file" accept="application/json" onChange={doImport} className="hidden" aria-label="Import session JSON" />
              </div>
            </PanelShell>
            <PanelShell n="04·C" title="Reusable prompt — seeded with this case">
              <p className="text-sm leading-relaxed mb-3">The same intake → evaluation → recommendation logic as a portable prompt, pre-filled with your current inputs. Runs in any capable LLM chat.</p>
              <button onClick={() => doCopy(prompt, "Prompt")} style={btn(copied ? C.green : C.blue, "#fff")} className="mb-3">{copied ? "COPIED ✓" : "COPY PROMPT"}</button>
              <pre className="text-xs p-3 overflow-auto" style={{ fontFamily: MONO, background: "#F0F2ED", border: `1px solid ${C.line}`, maxHeight: 320, whiteSpace: "pre-wrap", color: C.ink }}>{prompt}</pre>
            </PanelShell>
            <PanelShell n="04·D" title="Obsidian note — one per case">
              <p className="text-sm leading-relaxed mb-2">Vault-ready Markdown. The YAML frontmatter becomes Obsidian <strong>Properties</strong> — verdict, composite, the seven scores, sensitivity, tags — with the full analysis in the body and a link back to <code style={{ fontFamily: MONO }}>[[AI Use-Case Register]]</code>.</p>
              <p className="text-xs mb-3" style={{ color: C.inkSoft }}>Suggested filename: <code style={{ fontFamily: MONO }}>{safeFile(uc.name || "Untitled AI use case")}.md</code>. Create it via your Obsidian MCP (<code style={{ fontFamily: MONO }}>create_note</code>); append the index entry to the register (<code style={{ fontFamily: MONO }}>append_to_note</code>).</p>
              <div className="flex gap-2 flex-wrap mb-3">
                <button onClick={() => { if (!download(`${safeFile(uc.name)}.md`, obsNote(), "text/markdown")) flash("Download blocked — copy below"); }} style={btn(C.blue, "#fff")}>DOWNLOAD .MD</button>
                <button onClick={() => doCopy(obsNote(), "Obsidian note")} style={btn(C.surface, C.ink, `1px solid ${C.ink}`)}>COPY NOTE</button>
                <button onClick={() => doCopy(obsEntry(), "Index entry")} style={btn(C.surface, C.ink, `1px solid ${C.ink}`)}>COPY INDEX ENTRY</button>
              </div>
              <pre className="text-xs p-3 overflow-auto" style={{ fontFamily: MONO, background: "#F0F2ED", border: `1px solid ${C.line}`, maxHeight: 320, whiteSpace: "pre-wrap", color: C.ink }}>{obsNote()}</pre>
            </PanelShell>
          </div>
        )}

        {/* 05 LIBRARY */}
        {stage === 4 && (
          <div>
            <PanelShell n="05·A" title="Saved use cases">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <StoreChip />
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => { if (!download("ai-use-cases.csv", libCsv(), "text/csv")) { setCsvOpen(true); flash("Download blocked — copy below"); } }} style={btn(C.blue, "#fff")}>DOWNLOAD CSV</button>
                  <button onClick={() => setCsvOpen((o) => !o)} style={btn(C.surface, C.ink, `1px solid ${C.ink}`)}>{csvOpen ? "HIDE CSV" : "COPY CSV"}</button>
                  <button onClick={() => { if (!download("AI Use-Case Register.md", obsRegister(), "text/markdown")) flash("Download blocked — use Copy"); }} style={btn(C.surface, C.ink, `1px solid ${C.ink}`)}>REGISTER .MD</button>
                  <button onClick={() => doCopy(obsRegister(), "Obsidian register")} style={btn(C.surface, C.ink, `1px solid ${C.ink}`)}>COPY REGISTER</button>
                </div>
              </div>
              {storeStatus === "memory" && <Flag sev="warn">No persistent store is available in this environment, so saved cases live only for this session. Download the CSV or JSON to keep them. In the Claude artifact runtime the store is on and cases persist across sessions.</Flag>}
              {csvOpen && (
                <div className="mb-4">
                  <div className="flex gap-2 mb-2"><button onClick={() => doCopy(libCsv(), "CSV")} style={btn(C.blue, "#fff")}>COPY TO CLIPBOARD</button></div>
                  <textarea readOnly value={libCsv()} onFocus={(e) => e.target.select()} style={{ ...inputStyle, fontFamily: MONO, fontSize: 11, height: 160, whiteSpace: "pre" }} />
                </div>
              )}
              {library.length === 0 ? (
                <p className="text-sm" style={{ color: C.inkSoft }}>Nothing saved yet. Evaluate a case, then hit “Save to library.”</p>
              ) : (
                <div style={{ border: `1px solid ${C.line}` }}>
                  {library.map((r, i) => {
                    const vc = r.verdict === "BUILD" ? C.green : r.verdict === "REFINE" ? C.amber : C.red;
                    return (
                      <div key={r.id} className="flex items-center gap-3 p-3 flex-wrap" style={{ borderTop: i ? `1px solid ${C.line}` : "none", background: r.id === currentId ? C.blueSoft : C.surface }}>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: "#fff", background: vc, padding: "2px 6px" }}>{r.verdict}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">{r.uc.name || "Untitled"}</div>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: C.inkSoft }}>{r.composite}/100 · {r.quadrant.toLowerCase()} · {new Date(r.savedAt).toLocaleString()}</div>
                        </div>
                        <button onClick={() => loadRecord(r)} style={btn(C.surface, C.ink, `1px solid ${C.ink}`)}>LOAD</button>
                        <button onClick={() => deleteRecord(r.id)} style={btn("transparent", C.red, `1px solid ${C.red}`)}>DELETE</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </PanelShell>

            <PanelShell n="05·B" title="Send results to an external store (later)">
              <p className="text-sm leading-relaxed mb-2">This app can't call Google Sheets, Notion, or your Obsidian MCP directly from Claude's sandbox — outbound network calls are restricted here. Two honest routes, no secrets in the app:</p>
              <button onClick={() => setWireOpen((o) => !o)} style={btn(C.surface, C.ink, `1px solid ${C.ink}`)} className="mb-3">{wireOpen ? "HIDE STEPS" : "SHOW WIRING STEPS"}</button>
              {wireOpen && (
                <div className="text-sm leading-relaxed" style={{ color: C.ink }}>
                  <p className="mb-2"><strong>Route A — Claude pushes via your MCP (works today, no hosting).</strong> Copy the CSV above (or the JSON), paste it into a chat, and say where it goes: “append to my Sheet” → Zapier MCP (Google Sheets: Create Row); “add to my Notion DB” → Notion MCP (create pages, one per case); for <strong>Obsidian</strong>, use the note + register from the Export tab → your Obsidian MCP (<code style={{ fontFamily: MONO }}>create_note</code> per case, <code style={{ fontFamily: MONO }}>append_to_note</code> for the register). Credentials stay in your connectors, never in this app.</p>
                  <p className="mb-2"><strong>Route B — self-host and POST directly.</strong> Drop this .jsx into your own React app (outside the sandbox), create a Zapier “Catch Hook,” and add a <code style={{ fontFamily: MONO }}>fetch(hookUrl, &#123;method:"POST", body: JSON.stringify(record)&#125;)</code> call inside <code style={{ fontFamily: MONO }}>saveToLibrary</code>. Full snippet and column mapping are in the wiring guide delivered alongside this file.</p>
                  <p style={{ color: C.inkSoft }}>Notion property mapping and the Sheets header row are listed in the guide so the columns line up on the first try.</p>
                </div>
              )}
            </PanelShell>
          </div>
        )}

        {toast && <div style={{ position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", background: C.ink, color: C.paper, fontFamily: MONO, fontSize: 12, padding: "8px 14px", zIndex: 50 }}>{toast}</div>}

        <footer className="mt-8 pt-4 text-xs flex justify-between flex-wrap gap-2" style={{ borderTop: `1px solid ${C.line}`, color: C.inkSoft, fontFamily: MONO }}>
          <span>Heuristic instrument — outputs are defensible starting points, not guarantees.</span>
          <span>CRISP-DM · NIST AI RMF 1.0 · TRL/DRL · Impact×Effort</span>
        </footer>
      </div>
    </div>
  );
}
