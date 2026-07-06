// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { evaluate } from "@/lib/engine";
import { EXAMPLES } from "@/lib/examples";
import StudioApp from "./StudioApp";

/* The port's new logic is the API-backed library: optimistic save with the
   artifact's honest "save failed" behavior, server rows treated as truth. */

const serverRow = (over: Record<string, unknown> = {}) => ({
  id: "11111111-1111-1111-1111-111111111111",
  name: EXAMPLES[0].name,
  verdict: "BUILD", composite: 77, quadrant: "Quick win",
  payload: EXAMPLES[0],
  updatedAt: "2026-07-06T12:00:00.000Z",
  ...over,
});

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ok = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

describe("StudioApp — library wiring", () => {
  it("loads the library from /api/use-cases and shows the persistent-store chip", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/use-cases") return ok([serverRow()]);
      throw new Error(`unexpected fetch ${url}`);
    });
    render(<StudioApp />);
    await waitFor(() => expect(screen.getAllByText("persistent store: on").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText(/05 Library/));
    expect(screen.getAllByText("BUILD").length).toBeGreaterThan(0);
    expect(screen.getByText("77/100 · quick win · " + new Date("2026-07-06T12:00:00.000Z").toLocaleString())).toBeTruthy();
  });

  it("falls back to session-memory status when the library fetch fails", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error("network down")));
    render(<StudioApp />);
    await waitFor(() => expect(screen.getAllByText("session memory only").length).toBeGreaterThan(0));
  });

  it("saves via POST and reports 'Saved to library' with the server's row", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/use-cases" && !init?.method) return ok([]);
      if (url === "/api/use-cases" && init?.method === "POST") return ok(serverRow(), 201);
      throw new Error(`unexpected fetch ${url} ${init?.method}`);
    });
    render(<StudioApp />);
    await waitFor(() => expect(screen.getAllByText("persistent store: on").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText("SAVE TO LIBRARY"));
    await waitFor(() => expect(screen.getByText("Saved to library")).toBeTruthy());
    // Verdict shown for the saved record comes from the server response
    fireEvent.click(screen.getByText(/05 Library \(1\)/));
    expect(screen.getByText(/77\/100/)).toBeTruthy();
  });

  it("keeps the record locally and says so plainly when the save POST fails", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/use-cases" && !init?.method) return ok([]);
      if (url === "/api/use-cases" && init?.method === "POST") return ok({ error: "boom" }, 500);
      throw new Error(`unexpected fetch ${url} ${init?.method}`);
    });
    render(<StudioApp />);
    await waitFor(() => expect(screen.getAllByText("persistent store: on").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText("SAVE TO LIBRARY"));
    await waitFor(() => expect(screen.getByText("Save failed — kept in this session only")).toBeTruthy());
    // Honesty: the failure is visible, the record is not silently dropped
    expect(screen.getAllByText("session memory only").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText(/05 Library \(1\)/));
    expect(screen.getAllByText(EXAMPLES[0].name).length).toBeGreaterThan(0);
  });

  it("deletes via the API and restores the row if the DELETE fails", async () => {
    const row = serverRow();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/use-cases" && !init?.method) return ok([row]);
      if (url === `/api/use-cases/${row.id}` && init?.method === "DELETE") return ok({ error: "boom" }, 500);
      throw new Error(`unexpected fetch ${url} ${init?.method}`);
    });
    render(<StudioApp />);
    await waitFor(() => expect(screen.getAllByText("persistent store: on").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText(/05 Library/));
    fireEvent.click(screen.getByText("DELETE"));
    await waitFor(() => expect(screen.getByText("Delete failed — the record is still in your library")).toBeTruthy());
    expect(screen.getByText("DELETE")).toBeTruthy(); // row restored
  });

  it("renders the four stages and the showcase brief with the engine's numbers", async () => {
    fetchMock.mockImplementation(() => ok([]));
    render(<StudioApp />);
    const ev = evaluate(EXAMPLES[0]);
    // Evaluate stage shows the verdict card
    fireEvent.click(screen.getByText(/02 Evaluate/));
    expect(screen.getAllByText(ev.verdict).length).toBeGreaterThan(0);
    expect(screen.getAllByText(`composite ${ev.composite.toFixed(0)}/100 · ${ev.quadrant.toLowerCase()}`).length).toBeGreaterThan(0);
    // Recommend stage renders all four panels
    fireEvent.click(screen.getByText(/03 Recommend/));
    expect(screen.getByText("Architecture")).toBeTruthy();
    expect(screen.getByText("Workflow — CRISP-DM, made concrete")).toBeTruthy();
    expect(screen.getByText("Data access & governance")).toBeTruthy();
    expect(screen.getByText("Testing — layered, tied to the acceptance bar")).toBeTruthy();
    // Showcase brief renders with the footer disclaimer (brief rule 3)
    fireEvent.click(screen.getByText("SHOWCASE BRIEF"));
    expect(screen.getByText("AI use-case brief")).toBeTruthy();
    expect(screen.getAllByText(/Heuristic instrument/).length).toBeGreaterThan(0);
    // Mode toggle returns to practitioner view
    fireEvent.click(screen.getByText("PRACTITIONER VIEW"));
    expect(screen.getByText("AI Use-Case Studio")).toBeTruthy();
  });
});
