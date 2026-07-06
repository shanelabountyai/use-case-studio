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
// notFound() throws a sentinel we can assert on (real request → HTTP 404).
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

import SharePage from "./page";

const params = Promise.resolve({ token: "tok-123" });

beforeEach(() => { queue = []; });
afterEach(() => cleanup());

describe("public /s/[token]", () => {
  it("404s (notFound) for a revoked or missing link", async () => {
    queue = [[]]; // link lookup (revoked=false filter) matches nothing
    await expect(SharePage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s when the link resolves but its case is gone", async () => {
    queue = [[{ token: "tok-123", useCaseId: "uc-1", revoked: false }], []];
    await expect(SharePage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
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
