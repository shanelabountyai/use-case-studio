import { test, expect } from "@playwright/test";
import { createTestSession, destroyTestSession } from "./helpers/test-session";

test.describe("share-link flow", () => {
  test("create -> public render (no auth) -> revoke -> 404", async ({ page, context }) => {
    const session = await createTestSession(context);
    try {
      await page.goto("/studio");
      await page.getByRole("button", { name: "blank" }).click();
      const caseName = `E2E Share ${Date.now()}`;
      await page.getByPlaceholder("e.g. Contract clause triage").fill(caseName);
      await page.getByRole("button", { name: "SAVE TO LIBRARY" }).first().click();
      await expect(page.getByText(/Saved to library/)).toBeVisible();

      // Export stage -> Share manager -> create a link.
      await page.getByText(/04 Export/).click();
      await page.getByRole("button", { name: "CREATE SHARE LINK" }).click();
      const shareUrl = await page.getByTestId("share-link-url").first().inputValue();
      expect(shareUrl).toMatch(/\/s\/[A-Za-z0-9_-]{24,}$/);

      // Public render in a fresh, unauthenticated browser context.
      const publicContext = await context.browser()!.newContext();
      const publicPage = await publicContext.newPage();
      await publicPage.goto(shareUrl);
      await expect(publicPage.getByText("AI use-case brief")).toBeVisible();
      await expect(publicPage.getByText(caseName)).toBeVisible();
      await expect(publicPage.getByText(/Heuristic instrument/)).toBeVisible(); // disclaimer carries through
      await publicContext.close();

      // Revoke from the owner UI.
      await page.getByRole("button", { name: "REVOKE" }).click();
      await expect(page.getByText("revoked", { exact: true })).toBeVisible();

      // The public link now 404s.
      const afterContext = await context.browser()!.newContext();
      const afterPage = await afterContext.newPage();
      const resp = await afterPage.goto(shareUrl);
      expect(resp?.status()).toBe(404);
      await afterContext.close();
    } finally {
      await destroyTestSession(session.userId);
    }
  });
});
