import { test, expect, request } from "@playwright/test";

test("Viewer cannot send letters; owner can", async () => {
  const api = await request.newContext();
  // create a draft letter first
  const boot = await api.get("http://localhost:8080/children/bootstrap");\n  const childId = (await boot.json()).child.id;\n  const draft = await api.post("http://localhost:8080/tools/letter/draft", { data: { kind: "evaluation-request", merge_fields: { child_id: childId, parent_name: "P", child_name: "C", school_name: "S", requested_areas: "Speech", todays_date: "2025-09-10", reply_by: "2025-09-20" } } });
  const { letter_id } = await draft.json();
  // viewer role
  const viewer = await request.newContext({ extraHTTPHeaders: { 'x-user-role': 'advocate_viewer' } });
  const sendV = await viewer.post("http://localhost:8080/tools/letter/send", { data: { letter_id, to: ["demo@example.com"] } });
  expect(sendV.status()).toBeGreaterThanOrEqual(400);
  // owner role
  const owner = await request.newContext({ extraHTTPHeaders: { 'x-user-role': 'owner' } });
  const sendO = await owner.post("http://localhost:8080/tools/letter/send", { data: { letter_id, to: ["demo@example.com"] } });
  expect(sendO.ok()).toBeTruthy();
});

