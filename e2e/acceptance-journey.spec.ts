import { test, expect } from "@playwright/test";
import { createTestSession, destroyTestSession, reissueSession } from "./helpers/test-session";

/* The v1 acceptance-bar journey (FABLE-BRIEF.md):
   sign in -> create -> score -> read all four recommendation panels -> save
   -> sign out -> sign back in -> find it in the library. */
test.describe("acceptance-bar journey", () => {
  test("a case created and saved survives a sign-out/sign-in cycle", async ({ page, context }) => {
    const session = await createTestSession(context);
    try {
      await page.goto("/studio");
      await expect(page.getByRole("heading", { name: "AI Use-Case Studio" })).toBeVisible();

      // Capture: start a blank case, name it.
      await page.getByRole("button", { name: "blank" }).click();
      const caseName = `E2E Journey ${Date.now()}`;
      await page.getByPlaceholder("e.g. Contract clause triage").fill(caseName);

      // Evaluate: score it (verdict card renders from the default scores).
      await page.getByText(/02 Evaluate/).click();
      await expect(page.locator("text=composite").first()).toBeVisible();

      // Recommend: all four recommendation panels present.
      await page.getByText(/03 Recommend/).click();
      await expect(page.getByRole("heading", { name: "Architecture" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Workflow — CRISP-DM, made concrete" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Data access & governance" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Testing — layered, tied to the acceptance bar" })).toBeVisible();

      // Save.
      await page.getByRole("button", { name: "SAVE TO LIBRARY" }).first().click();
      await expect(page.getByText(/Saved to library|Updated in library/)).toBeVisible();

      // Sign out — the real signOut() code path, not a mock.
      await page.goto("/");
      await page.getByRole("button", { name: "Sign out" }).click();
      await expect(page).toHaveURL("/");
      await page.goto("/studio");
      await expect(page).toHaveURL("/"); // session guard redirects unauthenticated

      // Sign back in. Real Google OAuth can't be driven headlessly in CI
      // without live test credentials (BLOCKED — see the M4 report), so this
      // re-issues a session for the SAME user id, which is what a real
      // sign-in would resolve to — the point under test is that the case
      // persisted under that user, not the OAuth redirect dance itself.
      await reissueSession(context, session.userId);
      await page.goto("/studio");
      await page.getByText(/05 Library/).click();
      // Scope to the "Saved use cases" panel: since DK-3, the case name also
      // renders in the Portfolio summary (ranked list + sequencing), so an
      // unscoped getByText(caseName) is ambiguous.
      const savedPanel = page.locator("section", { hasText: "Saved use cases" });
      await expect(savedPanel.getByText(caseName)).toBeVisible();
    } finally {
      await destroyTestSession(session.userId);
    }
  });
});
