# FABLE BRIEF — Delivery Kit module (post-BUILD)

> Addendum to `FABLE-BRIEF.md`. Same rules apply (engine is source of truth, reference artifact is the design spec, honesty rules ship in the product, tests per milestone). This brief wires an already-built, already-tested generator layer into the app UI.

## What's already done (do NOT rewrite)

`src/lib/deliverykit.ts` is built, strict-TypeScript clean, and covered by `src/lib/deliverykit.test.ts` (passing). It exports pure builders that reuse the evaluation engine:
- `buildDiscoveryGuide(uc)` — intake questions, with targeted probes injected where the case is thin/low-scored.
- `buildPortfolio(records)` — rollup across saved cases (ranks by composite, sequences quick-wins-first).
- `buildSow(uc, engagement)` — statement of work; ties acceptance criteria to the case's acceptance bar; carries a **not-legal-advice** disclaimer; prepends a readiness note when the verdict isn't BUILD.
- `buildDeliveryPlan(uc, engagement)` — the six CPMAI phases, tailored from the case's architecture/data/testing recommendations.
- `buildRiskRegister(uc)` — risks derived from the case's flags and scores, plus baseline adoption/vendor risks.
- `deliveryKitToMarkdown(uc, engagement)` — assembles all four into one client-ready deliverable.
- `EngagementInputs` / `blankEngagement()`.

Your job is presentation and export, not regenerating this logic.

## MODEL ASSIGNMENT PER MILESTONE

Same logic as the main brief: the generator layer is already done and tested, so nothing here needs Fable's long-horizon reasoning — this whole module is wiring and presentation against an established pattern (M2 already set the design-fidelity bar).

| Milestone | Model | Why |
|---|---|---|
| DK-1 — Deliver stage | Opus | New tab + engagement-inputs panel; moderate UI work but the hard part (the generators) is done. |
| DK-2 — Render the four sections | Sonnet | Presentational, matches the pattern M2 already established. |
| DK-3 — Portfolio view | Sonnet | Straightforward rollup UI once M2 exists. |
| DK-4 — Exports | Sonnet | Mechanical: markdown download/copy, print stylesheet. |
| DK-5 — Tests | Sonnet | The `test-writer` subagent is already scoped for exactly this. |

## MILESTONES (append after the main brief's M5)

### DK-1 — Deliver stage
Add a sixth stage/tab, **Deliver**, to the studio UI (`reference/ai-use-case-studio.jsx` defines the stage pattern and design system). It's the post-BUILD step, so:
- Show it for any evaluated case, but when the verdict isn't BUILD, surface the SOW's readiness note prominently (the builder already returns it).
- Add an **Engagement inputs** panel bound to `EngagementInputs` (client, sponsor, practitioner default "Lab Intelligence, LLC", duration weeks, start date, commercial model). Persist these on the case payload (extend the jsonb; the engine ignores unknown fields).

### DK-2 — Render the four sections
Render, each from its structured builder (not free text):
1. Discovery guide — sections with question lists; visually flag `PROBE:` items.
2. SOW — disclaimer callout first (always visible), then sections.
3. Delivery plan — the six phases as cards: objective / activities / deliverables / exit criteria; show the CPMAI "confirm against your v7 materials" note.
4. Risk register — a table (ID, Risk, Category, L/I, Mitigation, Owner) with L/I colour-coded.
Match the reference design system. Visual-fidelity check before closing.

### DK-3 — Portfolio view
On the Library tab, add a **Portfolio** summary built from `buildPortfolio(records)` over the signed-in user's saved cases: ranked list, quadrant distribution, recommended sequencing, narrative. This is the multi-case client story.

### DK-4 — Exports
- Markdown: `deliveryKitToMarkdown` → download + copy (works today, zero deps).
- Print-to-PDF: a print stylesheet for the Deliver view (mirror the Showcase brief's approach).
- **Stretch, not required for v1:** a `.docx` export of the SOW + plan via a server route using the `docx` library. If you build it, keep generation server-side; do not claim it works until you've opened a generated file. If you don't, say so in the report — the markdown + print path is sufficient.

### DK-5 — Tests
Extend `deliverykit.test.ts`: engagement inputs round-trip through save/load; the Deliver stage renders without a crash for a PARK case (readiness note shows); portfolio ordering. Add one Playwright step: evaluate → Deliver → export markdown.

## HONESTY RULES SPECIFIC TO THIS MODULE

- The SOW disclaimer (`not legal advice`) renders in **every** view that shows the SOW, including any share/export. Never strip it.
- Don't auto-fill commercial amounts or dates with invented numbers — leave the bracketed placeholders the builder emits.
- CPMAI phase labels are presented as "CPMAI-aligned" with the confirm-against-v7 note; don't assert certification-authoritative wording the owner hasn't verified.
- Portfolio and plan are decision support, not guarantees — the footer disclaimer carries through.

## ACCEPTANCE BAR (module ships when)

A signed-in user can open an evaluated case → fill engagement inputs → see all four sections generated → export the full kit as markdown and print the brief; a PARK case shows the readiness note; the SOW disclaimer is present everywhere; delivery-kit tests + one e2e are green.
