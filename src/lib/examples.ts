import { blankCase, type UseCase } from "./engine";

/* The two worked examples from the reference artifact, verbatim.
   These are "load example" seeds in the studio UI. */
export const EXAMPLES: UseCase[] = [
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
  },
];
