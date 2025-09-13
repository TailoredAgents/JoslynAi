import { test, expect, request } from "@playwright/test";

test("Admin Usage dashboard renders cards when adminkey is provided", async ({ page }) => {
  const api = await request.newContext();
  const ok = await api.get(process.env.E2E_API_BASE || "http://localhost:8080/health");
  expect(ok.ok()).toBeTruthy();

  await page.goto("/admin/usage?adminkey=dev-admin");
  await expect(page.getByRole("heading", { name: /Admin • Usage & Cost/i })).toBeVisible();
  await expect(page.getByText(/Agent runs/i)).toBeVisible();
  await expect(page.getByText(/Letters sent/i)).toBeVisible();
});

