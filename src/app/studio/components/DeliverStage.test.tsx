// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { blankCase, evaluate, type UseCase } from "@/lib/engine";
import { blankEngagement } from "@/lib/deliverykit";
import { EXAMPLES } from "@/lib/examples";
import { DeliverStage } from "./DeliverStage";

const parkCase = (): UseCase => ({
  ...blankCase(),
  name: "Weak case",
  scores: { value: 1, feasibility: 1, dataReadiness: 1, risk: 1, cost: 1, timeToValue: 1, fit: 1 },
});

const renderStage = (uc: UseCase, over: Partial<Parameters<typeof DeliverStage>[0]> = {}) => {
  const props = {
    uc, ev: evaluate(uc), engagement: blankEngagement(),
    setEngagement: vi.fn(), currentId: null as string | null,
    storeStatus: "connected" as const, onSave: vi.fn(), onNew: vi.fn(),
    ...over,
  };
  render(<DeliverStage {...props} />);
  return props;
};

afterEach(() => cleanup());

describe("DeliverStage", () => {
  it("renders the engagement inputs panel with the practitioner default", () => {
    renderStage(EXAMPLES[0]);
    expect(screen.getByText("Engagement inputs")).toBeTruthy();
    expect(screen.getByDisplayValue("Lab Intelligence, LLC")).toBeTruthy();
    expect(screen.getByLabelText("Commercial model")).toBeTruthy();
  });

  it("shows the SOW readiness note prominently when the verdict is not BUILD", () => {
    const uc = parkCase();
    expect(evaluate(uc).verdict).toBe("PARK");
    renderStage(uc);
    expect(screen.getByText(/verdict is PARK, not BUILD/)).toBeTruthy();
    // The body text comes from buildSow, not re-derived here.
    expect(screen.getByText(/treated as conditional/)).toBeTruthy();
  });

  it("hides the readiness note for a BUILD case", () => {
    const uc = EXAMPLES[0];
    expect(evaluate(uc).verdict).toBe("BUILD");
    renderStage(uc);
    expect(screen.queryByText(/not BUILD/)).toBeNull();
  });

  it("edits an engagement field through setEngagement", () => {
    const { setEngagement } = renderStage(EXAMPLES[0]);
    fireEvent.change(screen.getByLabelText("Commercial model"), { target: { value: "Retainer" } });
    expect(setEngagement).toHaveBeenCalledWith(expect.objectContaining({ commercialModel: "Retainer" }));
  });
});
