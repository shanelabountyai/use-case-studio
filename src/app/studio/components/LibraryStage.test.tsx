// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { blankCase, type LibraryRecord, type Verdict, type UseCase } from "@/lib/engine";
import { LibraryStage } from "./LibraryStage";

const rec = (id: string, name: string, verdict: Verdict, composite: number, quadrant = "Quick win"): LibraryRecord => ({
  id, name, savedAt: "2026-07-06T12:00:00.000Z",
  uc: { ...blankCase(), name }, verdict, composite, quadrant,
});

const noop = () => {};
const renderLib = (library: LibraryRecord[], storeStatus: "loading" | "connected" | "memory" = "connected") =>
  render(
    <LibraryStage
      library={library} currentId={null} storeStatus={storeStatus}
      onLoad={noop} onDelete={noop} onCopy={noop} onDownload={noop}
      libCsv={() => "csv"} register={() => "register"}
    />,
  );

// Names appear in both the Portfolio and the saved list, so scope grouping
// assertions to the "Saved use cases" panel.
const savedPanel = () => screen.getByText("Saved use cases").closest("section") as HTMLElement;
const portfolioPanel = () => screen.getByText("Portfolio").closest("section") as HTMLElement;

afterEach(() => cleanup());

describe("LibraryStage — per-verdict grouping", () => {
  it("groups saved cases under BUILD / REFINE / PARK headers", () => {
    renderLib([
      rec("1", "Alpha", "BUILD", 80),
      rec("2", "Bravo", "PARK", 30),
      rec("3", "Charlie", "REFINE", 55),
    ]);
    const saved = within(savedPanel());
    const counts = saved.getAllByText(/^\d case(s)?$/).map((n) => n.textContent);
    expect(counts).toEqual(["1 case", "1 case", "1 case"]);
    expect(saved.getByText("Alpha")).toBeTruthy();
    expect(saved.getByText("Bravo")).toBeTruthy();
    expect(saved.getByText("Charlie")).toBeTruthy();
  });

  it("counts multiple cases in a group and hides empty verdicts", () => {
    renderLib([
      rec("1", "Alpha", "BUILD", 80),
      rec("2", "Beta", "BUILD", 72),
    ]);
    const saved = within(savedPanel());
    expect(saved.getByText("2 cases")).toBeTruthy();
    expect(saved.queryByText("1 case")).toBeNull();
  });

  it("shows the empty state (and no Portfolio) when the library has no records", () => {
    renderLib([]);
    expect(screen.getByText(/Nothing saved yet/)).toBeTruthy();
    expect(screen.getByText(/discovery intake form land here too/)).toBeTruthy();
    expect(screen.queryByText("Portfolio")).toBeNull();
  });

  /* M5: during the initial fetch the empty library must NOT claim "nothing
     saved yet" — it doesn't know that yet. Skeleton rows instead. */
  it("shows a loading skeleton, not the empty state, while the store is loading", () => {
    renderLib([], "loading");
    expect(screen.getByRole("status", { name: "Loading your library…" })).toBeTruthy();
    expect(screen.queryByText(/Nothing saved yet/)).toBeNull();
  });

  it("does not show the skeleton once records exist, even mid-refresh", () => {
    renderLib([rec("1", "Alpha", "BUILD", 80)], "loading");
    expect(screen.queryByRole("status", { name: "Loading your library…" })).toBeNull();
    expect(within(savedPanel()).getByText("Alpha")).toBeTruthy();
  });

  it("still offers whole-library CSV export", () => {
    renderLib([rec("1", "Alpha", "BUILD", 80)]);
    expect(within(savedPanel()).getByText("DOWNLOAD CSV")).toBeTruthy();
  });
});

describe("LibraryStage — intake badge", () => {
  // Intake cases carry source/intake on the jsonb payload, not the UseCase type.
  const intakeUc = (name: string): UseCase =>
    ({ ...blankCase(), name, source: "intake", intake: { submitterName: "Dana Lee" } } as unknown as UseCase);
  const intakeRec = (id: string, name: string): LibraryRecord => ({
    id, name, savedAt: "2026-07-06T12:00:00.000Z",
    uc: intakeUc(name), verdict: "BUILD", composite: 50, quadrant: "Quick win",
  });

  it("badges intake-sourced cases and names the submitter; manual cases have no badge", () => {
    renderLib([intakeRec("1", "Acme case"), rec("2", "Manual case", "BUILD", 80)]);
    const saved = within(savedPanel());
    expect(saved.getAllByText("FROM INTAKE").length).toBe(1); // only the intake row
    expect(saved.getByText(/from Dana Lee/)).toBeTruthy();
  });
});

describe("LibraryStage — Portfolio summary (DK-3)", () => {
  it("ranks cases by composite and quadrant distribution", () => {
    renderLib([
      rec("1", "Bravo", "BUILD", 72, "Big bet"),
      rec("2", "Alpha", "BUILD", 85, "Quick win"),
      rec("3", "Charlie", "PARK", 30, "Money pit"),
    ]);
    const pf = within(portfolioPanel());
    // Ranked by composite desc: the first ranked row is Alpha (85).
    const names = pf.getAllByText(/^(Alpha|Bravo|Charlie)$/).map((n) => n.textContent);
    expect(names[0]).toBe("Alpha");
    // Narrative reflects the count and the BUILD tally.
    expect(pf.getByText(/3 evaluated cases/)).toBeTruthy();
    expect(pf.getByText(/2 at BUILD/)).toBeTruthy();
  });

  it("sequences quick-wins first and excludes PARK from sequencing", () => {
    renderLib([
      rec("1", "BigBet", "BUILD", 90, "Big bet"),
      rec("2", "QuickWin", "BUILD", 60, "Quick win"),
      rec("3", "Parked", "PARK", 20, "Money pit"),
    ]);
    const pf = within(portfolioPanel());
    const items = pf.getAllByRole("listitem").map((li) => li.textContent || "");
    expect(items[0]).toContain("QuickWin"); // quick win sequenced first despite lower score
    expect(items.some((t) => t.includes("BigBet"))).toBe(true);
    expect(items.some((t) => t.includes("Parked"))).toBe(false); // PARK excluded
  });

  it("shows a fallback when there is nothing to sequence (all PARK)", () => {
    renderLib([rec("1", "Parked", "PARK", 20, "Money pit")]);
    expect(within(portfolioPanel()).getByText(/No non-parked cases to sequence/)).toBeTruthy();
  });

  it("excludes a PARK case from sequencing even when its quadrant is labeled Quick win", () => {
    renderLib([
      rec("1", "ParkedQuickWin", "PARK", 99, "Quick win"),
      rec("2", "RealQuickWin", "BUILD", 40, "Quick win"),
    ]);
    const pf = within(portfolioPanel());
    const items = pf.getAllByRole("listitem").map((li) => li.textContent || "");
    expect(items.some((t) => t.includes("ParkedQuickWin"))).toBe(false);
    expect(items.some((t) => t.includes("RealQuickWin"))).toBe(true);
  });
});
