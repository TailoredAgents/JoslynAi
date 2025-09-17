import { test, expect, request } from "@playwright/test";

test("Draft → Render letter flow", async () => {
  const api = await request.newContext();
  const boot = await api.get("http://localhost:8080/children/bootstrap");\n  const childId = (await boot.json()).child.id;\n  const d = await api.post("http://localhost:8080/tools/letter/draft", {
    data: { kind: "evaluation-request",
            merge_fields: { child_id: childId, parent_name:"Parent", child_name:"Demo", school_name:"Demo School", requested_areas:"Speech", todays_date:"2025-09-10", reply_by:"2025-09-20" } }
  });
  expect(d.ok()).toBeTruthy();
  const draft = await d.json();
  const r = await api.post("http://localhost:8080/tools/letter/render", { data: { letter_id: draft.letter_id }});
  expect(r.ok()).toBeTruthy();
  const ren = await r.json();
  expect(String(ren.pdf_uri)).toContain("letters/");
});

