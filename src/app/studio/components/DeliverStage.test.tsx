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
    onCopy: vi.fn(), onDownload: vi.fn(), safeFile: (n: string) => n || "use-case",
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

  it("renders the full stage without throwing for a PARK case — readiness note plus all four deliverable panels", () => {
    const uc = parkCase();
    expect(evaluate(uc).verdict).toBe("PARK");
    renderStage(uc);
    // Readiness note surfaced prominently (DK-1).
    expect(screen.getByText(/verdict is PARK, not BUILD/)).toBeTruthy();
    // All four DK-2 deliverable panels still render for a non-BUILD case.
    expect(screen.getByText("Discovery guide")).toBeTruthy();
    expect(screen.getByText("Statement of work")).toBeTruthy();
    expect(screen.getByText("CPMAI-aligned delivery plan")).toBeTruthy();
    expect(screen.getByText("Risk register")).toBeTruthy();
  });
});

describe("DeliverStage — DK-4 exports", () => {
  it("downloads the delivery kit as markdown, carrying the not-legal-advice disclaimer", () => {
    const { onDownload } = renderStage(EXAMPLES[0]);
    fireEvent.click(screen.getByText("DOWNLOAD MARKDOWN"));
    expect(onDownload).toHaveBeenCalledTimes(1);
    const [filename, text, mime] = onDownload.mock.calls[0];
    expect(filename).toMatch(/delivery-kit\.md$/);
    expect(mime).toBe("text/markdown");
    expect(text).toMatch(/not legal advice/i);
  });

  it("copies the same markdown deliverable", () => {
    const { onCopy } = renderStage(EXAMPLES[0]);
    fireEvent.click(screen.getByText("COPY MARKDOWN"));
    expect(onCopy).toHaveBeenCalledTimes(1);
    const [text] = onCopy.mock.calls[0];
    expect(text).toMatch(/# Delivery kit/);
    expect(text).toMatch(/not legal advice/i);
  });

  it("triggers window.print for SAVE AS PDF", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    renderStage(EXAMPLES[0]);
    fireEvent.click(screen.getByText("SAVE AS PDF"));
    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it("marks the editing chrome (engagement form, save bar) as no-print", () => {
    renderStage(EXAMPLES[0]);
    // The engagement panel heading sits inside a .no-print wrapper.
    const panel = screen.getByText("Engagement inputs").closest(".no-print");
    expect(panel).not.toBeNull();
  });
});
