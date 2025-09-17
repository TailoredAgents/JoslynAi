import { test, expect, request } from "@playwright/test";

test("Ask returns answer with citations", async () => {
  const api = await request.newContext();\n  const boot = await api.get("http://localhost:8080/children/bootstrap");\n  const childId = (await boot.json()).child.id;\n  const res = await api.post("http://localhost:8080/children/${childId}/ask", {
    data: { query: "What services and minutes are listed?" }
  });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(Array.isArray(json.citations)).toBeTruthy();
});

