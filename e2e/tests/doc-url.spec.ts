import { test, expect, request } from "@playwright/test";
import fs from "node:fs";

test("Upload → /documents/:id/url returns signed link", async () => {
  const api = await request.newContext();
  // Ensure sample file exists; create minimal PDF if not
  const sample = "dev_samples/sample-iep.pdf";
  if (!fs.existsSync(sample)) {
    fs.mkdirSync("dev_samples", { recursive: true });
    fs.writeFileSync(sample, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  }
  const boot = await api.get("http://localhost:8080/children/bootstrap");\n  const childId = (await boot.json()).child.id;\n  const up = await api.post("http://localhost:8080/children/${childId}/documents", {
    multipart: { file: fs.createReadStream(sample) }
  });
  expect(up.ok()).toBeTruthy();
  const { document_id } = await up.json();

  const res = await api.get(`http://localhost:8080/documents/${document_id}/url`);
  expect(res.ok()).toBeTruthy();
  const { url } = await res.json();
  expect(typeof url).toBe("string");
  expect(url).toContain("http");
});

