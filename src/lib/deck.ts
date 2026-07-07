/* =============================================================
   AI Use-Case Studio — DECK (PowerPoint) presentation layer.
   Pure, deterministic. NO pptxgenjs import here — this module maps the
   EXISTING engine evaluation + delivery-kit builders into a serializable
   slide model that is trivially unit-testable. The pptxgenjs rendering
   (browser/Node) lives in deck-pptx.ts and consumes this model.

   No scoring or content is reinvented: every value comes from evaluate(),
   buildDiscoveryGuide, buildDeliveryPlan, buildRiskRegister, buildSow.
   ============================================================= */

import { DIMS, type Evaluation, type UseCase } from "./engine";
import {
  buildDiscoveryGuide, buildDeliveryPlan, buildRiskRegister, buildSow,
  type EngagementInputs,
} from "./deliverykit";

/* Palette echoes the app (theme.ts) — hex without leading # for pptxgenjs. */
export const DECK_COLORS = {
  paper: "F4F5F2", surface: "FFFFFF", ink: "141D27", inkSoft: "525D68",
  line: "D9DCD5", blue: "1D46C8", blueSoft: "E8EDFB",
  green: "1D7A4A", amber: "A97711", amberSoft: "F7EED9", red: "A63A2B",
} as const;

export const DECK_FOOTER =
  "Heuristic instrument — defensible starting points, not guarantees. The SOW is a draft, not legal advice.";

export const verdictHex = (verdict: string) =>
  verdict === "BUILD" ? DECK_COLORS.green : verdict === "REFINE" ? DECK_COLORS.amber : DECK_COLORS.red;

export interface TitleSlide { kind: "title"; title: string; subtitle: string; verdict: string; footer: string }
export interface SummarySlide { kind: "summary"; title: string; bullets: string[]; footer: string }
export interface DiscoverySlide { kind: "discovery"; title: string; priorities: string[]; areas: string[]; footer: string }
export interface ScoresSlide { kind: "scores"; title: string; scores: { label: string; value: number }[]; footer: string }
export interface PlanSlide { kind: "plan"; title: string; phases: { phase: string; objective: string }[]; note: string; footer: string }
export interface RisksSlide { kind: "risks"; title: string; headers: string[]; rows: string[][]; footer: string }
export interface SowSlide { kind: "sow"; title: string; disclaimer: string; sections: { heading: string; body: string }[]; footer: string }

export type DeckSlide =
  | TitleSlide | SummarySlide | DiscoverySlide | ScoresSlide | PlanSlide | RisksSlide | SowSlide;

export interface Deck { title: string; slides: DeckSlide[] }

/* SOW sections surfaced on the deck's summary slide (kept short; the full SOW
   is in the markdown/print export). "Readiness note" is intentionally omitted
   here — it's carried on the title/summary via the verdict. */
const SOW_DECK_SECTIONS = ["Objective", "Deliverables", "Acceptance criteria", "Timeline", "Commercials"];

export function buildDeck(uc: UseCase, ev: Evaluation, engagement: EngagementInputs): Deck {
  const name = uc.name || "AI use case";
  const guide = buildDiscoveryGuide(uc);
  const plan = buildDeliveryPlan(uc, engagement);
  const register = buildRiskRegister(uc);
  const sow = buildSow(uc, engagement);

  // Discovery: surface the targeted PROBE items (ask-first priorities), prefix
  // stripped; plus the section names so the intake scope is visible.
  const priorities = guide.sections
    .flatMap((s) => s.questions.filter((q) => q.startsWith("PROBE:")).map((q) => q.replace(/^PROBE:\s*/, "")));
  const areas = guide.sections.map((s) => s.title);

  const sowSections = sow.sections.filter((s) => SOW_DECK_SECTIONS.includes(s.heading));

  const slides: DeckSlide[] = [
    {
      kind: "title",
      title: name,
      subtitle: `Verdict ${ev.verdict} · composite ${ev.composite.toFixed(0)}/100 · ${ev.quadrant}`,
      verdict: ev.verdict,
      footer: DECK_FOOTER,
    },
    {
      kind: "summary",
      title: "Executive summary",
      bullets: [
        `Verdict: ${ev.verdict} — composite ${ev.composite.toFixed(0)}/100 (${ev.quadrant}).`,
        // The engine's own rationale — the recommendation, not reinvented here.
        ev.verdictWhy,
        `Problem: ${uc.problem || "[not described]"}`,
      ],
      footer: DECK_FOOTER,
    },
    {
      kind: "discovery",
      title: "Discovery priorities",
      priorities: priorities.length ? priorities : ["No critical input gaps flagged — run the full intake to confirm."],
      areas,
      footer: DECK_FOOTER,
    },
    {
      kind: "scores",
      title: "Evaluation — dimension scores",
      scores: DIMS.map((d) => ({ label: d.label, value: uc.scores[d.key] })),
      footer: DECK_FOOTER,
    },
    {
      kind: "plan",
      title: "CPMAI-aligned delivery plan",
      phases: plan.phases.map((p) => ({ phase: p.phase, objective: p.objective })),
      note: plan.note, // carries the v7-confirm line + CPMAI trademark/independence disclaimer
      footer: DECK_FOOTER,
    },
    {
      kind: "risks",
      title: "Risk register",
      headers: ["ID", "Risk", "Category", "L/I", "Mitigation", "Owner"],
      rows: register.risks.map((r) => [r.id, r.risk, r.category, `${r.likelihood}/${r.impact}`, r.mitigation, r.owner]),
      footer: DECK_FOOTER,
    },
    {
      kind: "sow",
      title: "Statement of work — summary",
      disclaimer: sow.disclaimer, // not-legal-advice
      sections: sowSections,
      footer: DECK_FOOTER,
    },
  ];

  return { title: name, slides };
}

/** Flatten every text value in the deck — used by tests to assert content
 *  (e.g. the SOW disclaimer and CPMAI trademark line are present). */
export function deckToText(deck: Deck): string {
  const parts: string[] = [deck.title];
  for (const s of deck.slides) {
    parts.push(s.title, s.footer);
    switch (s.kind) {
      case "title": parts.push(s.subtitle, s.verdict); break;
      case "summary": parts.push(...s.bullets); break;
      case "discovery": parts.push(...s.priorities, ...s.areas); break;
      case "scores": parts.push(...s.scores.map((x) => `${x.label} ${x.value}`)); break;
      case "plan": parts.push(s.note, ...s.phases.flatMap((p) => [p.phase, p.objective])); break;
      case "risks": parts.push(...s.headers, ...s.rows.flat()); break;
      case "sow": parts.push(s.disclaimer, ...s.sections.flatMap((x) => [x.heading, x.body])); break;
    }
  }
  return parts.join("\n");
}
