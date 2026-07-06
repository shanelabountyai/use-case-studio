// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { blankCase, type LibraryRecord, type Verdict } from "@/lib/engine";
import { LibraryStage } from "./LibraryStage";

const rec = (id: string, name: string, verdict: Verdict, composite: number): LibraryRecord => ({
  id, name, savedAt: "2026-07-06T12:00:00.000Z",
  uc: { ...blankCase(), name }, verdict, composite, quadrant: "Quick win",
});

const noop = () => {};
const renderLib = (library: LibraryRecord[]) =>
  render(
    <LibraryStage
      library={library} currentId={null} storeStatus="connected"
      onLoad={noop} onDelete={noop} onCopy={noop} onDownload={noop}
      libCsv={() => "csv"} register={() => "register"}
    />,
  );

afterEach(() => cleanup());

describe("LibraryStage — per-verdict grouping", () => {
  it("groups saved cases under BUILD / REFINE / PARK headers", () => {
    renderLib([
      rec("1", "Alpha", "BUILD", 80),
      rec("2", "Bravo", "PARK", 30),
      rec("3", "Charlie", "REFINE", 55),
    ]);
    // One group header per non-empty verdict, in BUILD→REFINE→PARK order.
    const counts = screen.getAllByText(/^\d case(s)?$/).map((n) => n.textContent);
    expect(counts).toEqual(["1 case", "1 case", "1 case"]);
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Bravo")).toBeTruthy();
    expect(screen.getByText("Charlie")).toBeTruthy();
  });

  it("counts multiple cases in a group and hides empty verdicts", () => {
    renderLib([
      rec("1", "Alpha", "BUILD", 80),
      rec("2", "Beta", "BUILD", 72),
    ]);
    expect(screen.getByText("2 cases")).toBeTruthy();
    // No REFINE/PARK groups → their "N case(s)" labels are absent.
    expect(screen.queryByText("1 case")).toBeNull();
  });

  it("shows the empty state when the library has no records", () => {
    renderLib([]);
    expect(screen.getByText(/Nothing saved yet/)).toBeTruthy();
  });

  it("still offers whole-library CSV export", () => {
    const { container } = renderLib([rec("1", "Alpha", "BUILD", 80)]);
    expect(within(container).getByText("DOWNLOAD CSV")).toBeTruthy();
  });
});
