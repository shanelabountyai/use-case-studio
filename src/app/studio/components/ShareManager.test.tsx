// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ShareManager } from "./ShareManager";

const fetchMock = vi.fn();
const ok = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ShareManager", () => {
  it("tells the user to save first when the case is unsaved", () => {
    render(<ShareManager currentId={null} />);
    expect(screen.getByText(/Save this case to your library first/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not create links for an optimistic (unsaved-) id", () => {
    render(<ShareManager currentId="unsaved-abc" />);
    expect(screen.getByText(/Save this case to your library first/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists existing links, creates a new one, and revokes it", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.startsWith("/api/share-links?") ) return ok([]);
      if (url === "/api/share-links" && init?.method === "POST")
        return ok({ token: "tok-xyz", useCaseId: "uc-1", revoked: false, createdAt: "" }, 201);
      if (url === "/api/share-links/tok-xyz" && init?.method === "DELETE") return ok({ ok: true });
      throw new Error(`unexpected ${url} ${init?.method}`);
    });
    render(<ShareManager currentId="uc-1" />);
    await waitFor(() => expect(screen.getByText("No share links for this case yet.")).toBeTruthy());

    fireEvent.click(screen.getByText("CREATE SHARE LINK"));
    await waitFor(() => expect(screen.getByDisplayValue(/\/s\/tok-xyz$/)).toBeTruthy());

    fireEvent.click(screen.getByText("REVOKE"));
    await waitFor(() => expect(screen.getByText("revoked")).toBeTruthy());
  });

  it("shows an honest inline error when create fails", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.startsWith("/api/share-links?")) return ok([]);
      if (init?.method === "POST") return ok({ error: "boom" }, 500);
      throw new Error("unexpected");
    });
    render(<ShareManager currentId="uc-1" />);
    await waitFor(() => expect(screen.getByText("No share links for this case yet.")).toBeTruthy());
    fireEvent.click(screen.getByText("CREATE SHARE LINK"));
    await waitFor(() => expect(screen.getByText(/Couldn't create a share link/)).toBeTruthy());
  });
});
