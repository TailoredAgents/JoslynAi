import { test, expect } from "@playwright/test";

test("Home localizes with ?lang=es", async ({ page }) => {
  await page.goto("/?lang=es");
  const locator = page.getByText("Subir documentos");
  await expect(locator).toBeVisible();
});

