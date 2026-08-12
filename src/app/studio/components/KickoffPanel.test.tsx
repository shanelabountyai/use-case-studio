// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { blankCase, evaluate, type UseCase } from "@/lib/engine";
import { EXAMPLES } from "@/lib/examples";
import { KickoffPanel } from "./KickoffPanel";

const parkCase = (): UseCase => ({
  ...blankCase(),
  name: "Weak case",
  scores: { value: 1, feasibility: 1, dataReadiness: 1, risk: 1, cost: 1, timeToValue: 1, fit: 1 },
});

// First example that actually scores BUILD — the only verdict the API enqueues.
const buildCase = (): UseCase => {
  const uc = EXAMPLES.map((e) => e.case ?? e).find((c) => evaluate(c as UseCase).verdict === "BUILD");
  if (!uc) throw new Error("no BUILD example to test against");
  return uc as UseCase;
};

const renderPanel = (uc: UseCase, currentId: string | null = "case-1") => {
  const props = {
    ev: evaluate(uc), currentId, caseName: uc.name,
    onDownload: vi.fn(), onCopy: vi.fn(), safeFile: (n: string) => n || "use-case",
  };
  render(<KickoffPanel {...props} />);
  return props;
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("KickoffPanel", () => {
  it("blocks an unsaved case — the plan is tied to a saved case id", () => {
    renderPanel(buildCase(), null);
    expect(screen.getByText(/Save this case to your library first/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /GENERATE BUILD PLAN/i })).toBeNull();
  });

  it("blocks a non-BUILD verdict rather than letting the API 501/200-PARK it", () => {
    renderPanel(parkCase());
    expect(screen.getByText(/Only BUILD cases generate a build plan/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /GENERATE BUILD PLAN/i })).toBeNull();
  });

  it("enqueues on click and shows the queued status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ jobId: "job-1", status: "queued" }), { status: 202 },
    )));
    renderPanel(buildCase());
    fireEvent.click(screen.getByRole("button", { name: /GENERATE BUILD PLAN/i }));
    await waitFor(() => expect(screen.getByText(/queued/i)).toBeTruthy());
  });

  it("surfaces the missing-inputs list from a 422 instead of a bare failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ error: "incomplete inputs", missing: ["problem", "owner"] }), { status: 422 },
    )));
    renderPanel(buildCase());
    fireEvent.click(screen.getByRole("button", { name: /GENERATE BUILD PLAN/i }));
    await waitFor(() => expect(screen.getByText(/missing: problem, owner/i)).toBeTruthy());
  });
});
