/* Golden UseCase fixtures for the Build Kickoff pipeline, faithful to the two
   prototype runs (docs/build-kickoff/PROTOTYPE-run{1,2}-*.md). Shared across
   BK-2 (serializer golden tests), BK-3/BK-4 (planner/critic fixtures), and BK-7
   (the launch-gate corpus) so all three grade against the same inputs.

   Scores are chosen to reproduce each run's verdict/quadrant, not to hit the
   exact composite to the point — the engine is the source of truth for the
   number (BUILD ≈ 75 here vs the doc's 77; REFINE ≈ 64 vs 66). */

import { blankCase, type UseCase } from "../engine";

/* Run 1 — Internal policy & knowledge assistant. lookup → RAG, BUILD, Quick win. */
export const CASE_POLICY_LOOKUP: UseCase = {
  ...blankCase(),
  name: "Internal policy & knowledge assistant",
  problem:
    "Employees can't find answers in scattered HR/policy documents; HR fields the same questions repeatedly.",
  currentCost: "~HR hours/week answering repeat policy questions (estimate)",
  users: "All employees; HR as owner",
  outcome: "Self-serve, citation-backed answers to policy questions",
  acceptanceBar:
    "≥90% correct-with-citation on a fixed 100-question HR-authored golden set; zero fabrication; zero leakage of salary bands or individual HR records.",
  dataSources: "SharePoint policy PDFs, employee handbook pages, curated FAQ Slack threads",
  dataFormat: "documents",
  dataVolume: "medium",
  dataSensitivity: "internal",
  dataFreshness: "periodic",
  latency: "interactive",
  budget: "One builder / one quarter",
  compliance: "",
  oversight: "spot-check",
  taskVolume: "high",
  taskShape: "lookup",
  scores: { value: 4, feasibility: 4, dataReadiness: 3, risk: 4, cost: 3, timeToValue: 4, fit: 4 },
};

/* Run 2 — Invoice/document triage classifier. classify → confidence gate, REFINE. */
export const CASE_INVOICE_CLASSIFY: UseCase = {
  ...blankCase(),
  name: "Invoice/document triage classifier",
  problem:
    "AP staff manually sort incoming invoices/documents into categories; slow and error-prone at volume.",
  currentCost: "~1 FTE of effort (unvalidated value anchor, estimate)",
  users: "Accounts-payable team",
  outcome: "Auto-route confident classifications; defer the rest to a human queue",
  acceptanceBar:
    "≥95% routing accuracy on a frozen 500-doc held-out set, aggregate and per-category; every below-threshold prediction and any error defers to a human rather than auto-routing.",
  dataSources: "Shared AP inbox / AP drive of historically foldered documents (noisy labels)",
  dataFormat: "mixed",
  dataVolume: "large",
  dataSensitivity: "pii",
  dataFreshness: "realtime",
  latency: "batch",
  budget: "Unscoped — gates the build",
  compliance: "Vendor bank details under retention rules",
  oversight: "spot-check",
  taskVolume: "high",
  taskShape: "classify",
  scores: { value: 4, feasibility: 3, dataReadiness: 2, risk: 3, cost: 3, timeToValue: 3, fit: 4 },
};

/* A deliberately weak case → PARK, exercising the no-spend note path. */
export const CASE_THIN_PARK: UseCase = {
  ...blankCase(),
  name: "Vague automation idea",
  problem: "We should use AI somewhere.",
  taskShape: "",
  scores: { value: 2, feasibility: 2, dataReadiness: 1, risk: 2, cost: 2, timeToValue: 2, fit: 2 },
};
