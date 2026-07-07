import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { createTestSession, destroyTestSession } from "./helpers/test-session";

/* DK-5: a worked example carried through to the Deliver stage and exported
   as markdown — proving the whole pipeline (load -> evaluate -> deliver kit
   builders -> download) runs end to end against a real running app, and
   that the exported file actually carries the SOW's not-legal-advice
   disclaimer (FABLE-BRIEF-DELIVERY-KIT honesty requirement). */
test.describe("deliver export", () => {
  test("worked example -> Deliver stage -> download markdown carries the not-legal-advice disclaimer", async ({ page, context }) => {
    const session = await createTestSession(context);
    try {
      await page.goto("/studio");
      await expect(page.getByRole("heading", { name: "AI Use-Case Studio" })).toBeVisible();

      // Load a worked example rather than a blank case, so the delivery kit
      // builders have real content (acceptance bar, data sources, etc.) to
      // draw from.
      await page.getByRole("button", { name: "Internal policy & knowledge assistant" }).click();

      await page.getByText(/06 Deliver/).click();
      await expect(page.getByText("Engagement inputs")).toBeVisible();

      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "DOWNLOAD MARKDOWN" }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/delivery-kit\.md$/);

      const path = await download.path();
      expect(path).toBeTruthy();
      const text = readFileSync(path as string, "utf8");
      expect(text).toMatch(/not legal advice/i);
      expect(text).toContain("# Delivery kit");
    } finally {
      await destroyTestSession(session.userId);
    }
  });
});
