import pptxgen from "pptxgenjs";
import { DECK_COLORS as C, DECK_FOOTER, verdictHex, type Deck, type DeckSlide } from "./deck";

/* Renders the pure Deck model (deck.ts) into a pptxgenjs presentation.
   Imports pptxgenjs, so this module is loaded lazily (dynamic import) from the
   client — it never touches SSR or the unit-test path. Works in Node too
   (used by the verification script). No content is invented here; every value
   comes from the Deck model, which comes from the engine + kit builders. */

const SANS = "IBM Plex Sans";
const MONO = "IBM Plex Mono";

type Pptx = InstanceType<typeof pptxgen>;
type Slide = ReturnType<Pptx["addSlide"]>;

function header(slide: Slide, title: string) {
  slide.addText("LAB INTELLIGENCE · DELIVERY KIT", { x: 0.5, y: 0.32, w: 12.3, h: 0.3, fontSize: 10, color: C.blue, fontFace: MONO, charSpacing: 2 });
  slide.addText(title, { x: 0.5, y: 0.62, w: 12.3, h: 0.6, fontSize: 24, bold: true, color: C.ink, fontFace: SANS });
}

function renderSlide(pptx: Pptx, s: DeckSlide) {
  const slide = pptx.addSlide({ masterName: "STUDIO" });

  switch (s.kind) {
    case "title": {
      slide.addText("LAB INTELLIGENCE · AI USE-CASE STUDIO", { x: 0.6, y: 0.7, w: 12, h: 0.3, fontSize: 11, color: C.blue, fontFace: MONO, charSpacing: 2 });
      slide.addText(s.verdict, { x: 0.6, y: 1.7, w: 2.4, h: 0.7, fontSize: 22, bold: true, color: "FFFFFF", fill: { color: verdictHex(s.verdict) }, align: "center", valign: "middle", fontFace: MONO });
      slide.addText(s.title, { x: 0.6, y: 2.7, w: 12, h: 1.6, fontSize: 40, bold: true, color: C.ink, fontFace: SANS, valign: "top" });
      slide.addText(s.subtitle, { x: 0.6, y: 4.4, w: 12, h: 0.6, fontSize: 18, color: C.inkSoft, fontFace: MONO });
      break;
    }
    case "summary": {
      header(slide, s.title);
      slide.addText(
        s.bullets.map((b) => ({ text: b, options: { bullet: { indent: 18 }, breakLine: true, paraSpaceAfter: 10 } })),
        { x: 0.6, y: 1.5, w: 12, h: 5, fontSize: 15, color: C.ink, fontFace: SANS, valign: "top" },
      );
      break;
    }
    case "discovery": {
      header(slide, s.title);
      slide.addText(
        s.priorities.map((p) => ({ text: p, options: { bullet: { code: "25B2" }, color: C.amber, breakLine: true, paraSpaceAfter: 8 } })),
        { x: 0.6, y: 1.5, w: 12, h: 4.4, fontSize: 14, fontFace: SANS, valign: "top" },
      );
      slide.addText(`Discovery areas: ${s.areas.join("  ·  ")}`, { x: 0.6, y: 6.25, w: 12.2, h: 0.5, fontSize: 11, color: C.inkSoft, fontFace: MONO });
      break;
    }
    case "scores": {
      header(slide, s.title);
      slide.addChart(
        pptx.ChartType.bar,
        [{ name: "Score (0–5)", labels: s.scores.map((x) => x.label), values: s.scores.map((x) => x.value) }],
        {
          x: 0.6, y: 1.4, w: 12, h: 5, barDir: "bar",
          chartColors: [C.blue], showValue: true, dataLabelColor: C.ink, dataLabelFontFace: MONO, dataLabelFontSize: 11,
          valAxisMinVal: 0, valAxisMaxVal: 5, valAxisMajorUnit: 1,
          catAxisLabelColor: C.ink, catAxisLabelFontFace: SANS, catAxisLabelFontSize: 11,
          valAxisLabelColor: C.inkSoft, valAxisLabelFontFace: MONO, showLegend: false, showTitle: false,
        },
      );
      break;
    }
    case "plan": {
      header(slide, s.title);
      const col = (phases: { phase: string; objective: string }[]) =>
        phases.flatMap((p) => ([
          { text: p.phase, options: { bold: true, color: C.blue, fontSize: 13, breakLine: true, fontFace: SANS } },
          { text: p.objective, options: { color: C.ink, fontSize: 11, breakLine: true, paraSpaceAfter: 10, fontFace: SANS } },
        ]));
      slide.addText(col(s.phases.slice(0, 3)), { x: 0.6, y: 1.45, w: 5.9, h: 4.6, valign: "top" });
      slide.addText(col(s.phases.slice(3)), { x: 6.8, y: 1.45, w: 5.9, h: 4.6, valign: "top" });
      // Note carries the v7-confirm line + CPMAI trademark/independence disclaimer.
      slide.addText(s.note, { x: 0.6, y: 6.2, w: 12.2, h: 0.6, fontSize: 8, italic: true, color: C.inkSoft, fontFace: MONO, valign: "top" });
      break;
    }
    case "risks": {
      header(slide, s.title);
      const headRow = s.headers.map((h) => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: C.blue }, fontFace: MONO, fontSize: 9 } }));
      const bodyRows = s.rows.map((r) => r.map((cell) => ({ text: cell, options: { color: C.ink, fontFace: SANS, fontSize: 9 } })));
      slide.addTable([headRow, ...bodyRows], {
        x: 0.5, y: 1.4, w: 12.33, colW: [0.6, 3.1, 1.3, 0.8, 4.63, 1.9],
        border: { type: "solid", color: C.line, pt: 0.5 }, valign: "top", autoPage: false,
      });
      break;
    }
    case "sow": {
      header(slide, s.title);
      slide.addText(
        [
          { text: "NOT LEGAL ADVICE", options: { bold: true, fontSize: 9, color: C.amber, fontFace: MONO, breakLine: true } },
          { text: s.disclaimer, options: { fontSize: 10, color: C.ink, fontFace: SANS } },
        ],
        { x: 0.6, y: 1.35, w: 12.1, h: 1.15, fill: { color: C.amberSoft }, line: { color: C.amber, width: 1 }, valign: "middle", margin: 8 },
      );
      slide.addText(
        s.sections.flatMap((sec) => ([
          { text: sec.heading, options: { bold: true, color: C.blue, fontSize: 11, fontFace: MONO, breakLine: true } },
          { text: sec.body, options: { color: C.ink, fontSize: 10, fontFace: SANS, breakLine: true, paraSpaceAfter: 8 } },
        ])),
        { x: 0.6, y: 2.7, w: 12.1, h: 3.9, valign: "top" },
      );
      break;
    }
  }
}

export function renderDeck(deck: Deck): Pptx {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pptx.author = "AI Use-Case Studio";
  pptx.title = deck.title;

  // Master carries the footer disclaimer + a rule line onto EVERY slide.
  pptx.defineSlideMaster({
    title: "STUDIO",
    background: { color: C.paper },
    objects: [
      { line: { x: 0.5, y: 6.95, w: 12.33, h: 0, line: { color: C.line, width: 1 } } },
      { text: { text: DECK_FOOTER, options: { x: 0.5, y: 6.98, w: 12.33, h: 0.4, fontSize: 8, color: C.inkSoft, fontFace: MONO, align: "left", valign: "middle" } } },
    ],
  });

  deck.slides.forEach((s) => renderSlide(pptx, s));
  return pptx;
}

/** Build the .pptx from a Deck and trigger a browser download. */
export async function downloadDeck(deck: Deck, fileName: string): Promise<void> {
  const pptx = renderDeck(deck);
  await pptx.writeFile({ fileName });
}
