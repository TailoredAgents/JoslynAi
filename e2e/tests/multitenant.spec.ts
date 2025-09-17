import { test, expect, request } from "@playwright/test";
import fs from "node:fs";

async function ensureSample(path: string) {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(require("node:path").dirname(path), { recursive: true });
    fs.writeFileSync(path, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  }
}

test.describe("Multi-tenant isolation", () => {
  test("Document URL is org-scoped (404 cross-tenant)", async () => {
    const orgA = await request.newContext({ extraHTTPHeaders: { "x-org-id": "org-a-e2e" } });
    const orgB = await request.newContext({ extraHTTPHeaders: { "x-org-id": "org-b-e2e" } });

    await orgA.get("http://localhost:8080/health");
    const boot = await orgA.get("http://localhost:8080/children/bootstrap");
    const childId = (await boot.json()).child.id;

    const sample = "dev_samples/sample-iep.pdf";
    await ensureSample(sample);

    const up = await orgA.post(`http://localhost:8080/children/${childId}/documents`, {
      multipart: { file: fs.createReadStream(sample) }
    });
    expect(up.ok()).toBeTruthy();
    const { document_id } = await up.json();

    const urlA = await orgA.get(`http://localhost:8080/documents/${document_id}/url`);
    expect(urlA.ok()).toBeTruthy();

    const urlB = await orgB.get(`http://localhost:8080/documents/${document_id}/url`);
    expect(urlB.status()).toBe(404);

    // jobs should be visible to org A but not to org B
    const jobsA = await orgA.get(`http://localhost:8080/jobs?child_id=${childId}`);
    expect(jobsA.ok()).toBeTruthy();
    const listA = await jobsA.json();
    expect(Array.isArray(listA)).toBeTruthy();
    expect(listA.length).toBeGreaterThanOrEqual(1);

    const jobsB = await orgB.get(`http://localhost:8080/jobs?child_id=${childId}`);
    expect(jobsB.ok()).toBeTruthy();
    const listB = await jobsB.json();
    expect(Array.isArray(listB)).toBeTruthy();
    expect(listB.length).toBe(0);
  });

  test("Letters render blocked cross-tenant (404)", async () => {
    const orgA = await request.newContext({ extraHTTPHeaders: { "x-org-id": "org-a-e2e" } });
    const orgB = await request.newContext({ extraHTTPHeaders: { "x-org-id": "org-b-e2e" } });

    const boot = await orgA.get("http://localhost:8080/children/bootstrap");
    const childId = (await boot.json()).child.id;

    const draft = await orgA.post("http://localhost:8080/tools/letter/draft", {
      data: {
        kind: "evaluation-request",
        merge_fields: {
          child_id: childId,
          parent_name: "Parent",
          child_name: "Demo Child",
          school_name: "Demo School",
          requested_areas: "Speech",
          todays_date: "2025-09-10",
          reply_by: "2025-09-20"
        }
      }
    });
    expect(draft.ok()).toBeTruthy();
    const { letter_id } = await draft.json();

    const renderA = await orgA.post("http://localhost:8080/tools/letter/render", { data: { letter_id } });
    expect(renderA.ok()).toBeTruthy();

    const renderB = await orgB.post("http://localhost:8080/tools/letter/render", { data: { letter_id } });
    expect(renderB.status()).toBe(404);
  });
});

