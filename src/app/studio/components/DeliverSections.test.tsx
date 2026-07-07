// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import { blankCase, evaluate, type UseCase } from "@/lib/engine";
import {
  blankEngagement, buildDiscoveryGuide, buildDeliveryPlan, buildRiskRegister,
} from "@/lib/deliverykit";
import { DeliverSections } from "./DeliverSections";

// A case with a missing acceptance bar + cost -> the discovery guide emits
// PROBE items, and it evaluates to a non-BUILD verdict.
const thinCase = (): UseCase => ({ ...blankCase(), name: "Thin case", acceptanceBar: "", currentCost: "" });

const renderSections = (uc: UseCase) =>
  render(<DeliverSections uc={uc} engagement={blankEngagement()} />);

afterEach(() => cleanup());

describe("DeliverSections — discovery guide", () => {
  it("renders each builder section title and visually flags PROBE items", () => {
    const uc = thinCase();
    const guide = buildDiscoveryGuide(uc);
    guide.sections.forEach((s) => expect(screen.queryByText(s.title)).not.toBeTruthy()); // sanity: not rendered yet
    renderSections(uc);
    guide.sections.forEach((s) => expect(screen.getByText(s.title)).toBeTruthy());
    // PROBE items are rendered with a "probe" tag and the PROBE: prefix stripped.
    const probeTags = screen.getAllByText("probe");
    expect(probeTags.length).toBeGreaterThan(0);
    expect(screen.queryByText(/^PROBE:/)).toBeNull();
  });
});

describe("DeliverSections — SOW", () => {
  it("renders the not-legal-advice disclaimer callout before the sections", () => {
    renderSections(thinCase());
    // Match the disclaimer body specifically (the short "Not legal advice"
    // eyebrow label also contains that phrase).
    const disclaimer = screen.getByText(/not legal advice and is not a binding agreement/i);
    expect(disclaimer).toBeTruthy();
    // Disclaimer appears before the "Parties" section in document order.
    const parties = screen.getByText("Parties");
    expect(disclaimer.compareDocumentPosition(parties) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("does not duplicate the readiness note (shown prominently by the stage)", () => {
    renderSections(thinCase()); // non-BUILD, so buildSow prepends a Readiness note
    expect(screen.queryByText("Readiness note")).toBeNull();
  });
});

describe("DeliverSections — delivery plan", () => {
  it("renders all six CPMAI phase cards and the confirm-against-v7 note", () => {
    const uc = thinCase();
    const plan = buildDeliveryPlan(uc, blankEngagement());
    renderSections(uc);
    plan.phases.forEach((p) => expect(screen.getByText(p.phase)).toBeTruthy());
    expect(screen.getByText(/confirm exact wording against your current v7 materials/i)).toBeTruthy();
  });
});

describe("DeliverSections — risk register", () => {
  it("renders a table with the expected headers and a row per builder risk", () => {
    const uc = thinCase();
    const reg = buildRiskRegister(uc);
    renderSections(uc);
    const table = screen.getByRole("table");
    ["ID", "Risk", "Category", "L/I", "Mitigation", "Owner"].forEach((h) =>
      expect(within(table).getByText(h)).toBeTruthy());
    // One row per risk (plus the header row).
    expect(within(table).getAllByRole("row").length).toBe(reg.risks.length + 1);
    // Always-present baseline adoption risk is there.
    expect(within(table).getByText(/people don't change how they work/)).toBeTruthy();
  });

  it("evaluates the thin case as non-BUILD (sanity for the readiness path)", () => {
    expect(evaluate(thinCase()).verdict).not.toBe("BUILD");
  });
});
