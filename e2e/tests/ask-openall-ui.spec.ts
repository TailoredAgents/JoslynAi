import { test, expect, request } from "@playwright/test";
import fs from "node:fs";

test("Ask UI shows 'Open all highlights' after uploading a sample IEP", async ({ page }) => {
  const api = await request.newContext();
  await api.get("http://localhost:8080/health");
  const sample = "dev_samples/sample-iep.pdf";
  if (!fs.existsSync(sample)) {
    fs.mkdirSync("dev_samples", { recursive: true });
    fs.writeFileSync(sample, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  }
  await api.post("http://localhost:8080/children/demo-child/documents", {
    multipart: { file: fs.createReadStream(sample) }
  });

  await page.goto("/?lang=en");
  await page.getByPlaceholder(/Ask about/i).fill("What services and minutes are listed?");
  await page.getByRole("button", { name: /Ask|Search|Submit/i }).click();

  await expect(page.getByText(/Open all highlights/i)).toBeVisible();
});

