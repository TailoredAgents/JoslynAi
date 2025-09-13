import { test, expect, request } from "@playwright/test";

test("Onboarding wizard drafts a letter", async ({ page }) => {
  const api = await request.newContext();
  await api.get("http://localhost:8080/health");
  await page.goto("/onboarding");
  await page.getByRole("button", { name: /Create Child/i }).click();
  await page.getByRole("button", { name: /Use sample IEP/i }).click();
  await page.getByRole("button", { name: /Continue/i }).click();
  await page.getByRole("button", { name: /Run/i }).click();
  await page.getByRole("button", { name: /Draft Letter/i }).click();
  await expect(page.getByText(/Drafted letter:/i)).toBeVisible();
});

