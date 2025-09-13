import { test, expect, request } from "@playwright/test";

test("API /health returns ok", async () => {
  const api = await request.newContext();
  const url = process.env.E2E_API_BASE || "http://localhost:8080/health";
  const res = await api.get(url);
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json).toEqual({ ok: true });
});

