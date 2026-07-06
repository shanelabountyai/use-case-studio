// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EXAMPLES } from "@/lib/examples";

// db.select() returns the next queued result set, in call order.
let queue: unknown[][] = [];
const chain = () => {
  const rows = queue.shift() ?? [];
  const p = Promise.resolve(rows) as Promise<unknown[]> & Record<string, unknown>;
  for (const m of ["from", "where"]) p[m] = () => p;
  return p;
};
vi.mock("@/db", () => ({ db: { select: () => chain() } }));

import SharePage from "./page";

const params = Promise.resolve({ token: "tok-123" });

beforeEach(() => { queue = []; });
afterEach(() => cleanup());

describe("public /s/[token]", () => {
  it("shows a not-available message for a revoked or missing link", async () => {
    queue = [[]]; // link lookup (revoked=false filter) matches nothing
    render(await SharePage({ params }));
    expect(screen.getByText("This brief isn't available")).toBeTruthy();
    expect(screen.getByText(/revoked by its owner/)).toBeTruthy();
  });

  it("renders the full Showcase brief for a live link", async () => {
    queue = [
      [{ token: "tok-123", useCaseId: "uc-1", revoked: false }],
      [{ id: "uc-1", payload: EXAMPLES[0] }],
    ];
    render(await SharePage({ params }));
    expect(screen.getByText("AI use-case brief")).toBeTruthy();
    expect(screen.getByText(EXAMPLES[0].name)).toBeTruthy();
    // Honesty disclaimer carries into the shared brief (brief rule 3).
    expect(screen.getAllByText(/Heuristic instrument/).length).toBeGreaterThan(0);
  });
});
