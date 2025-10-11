import { test, expect, request } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

test.describe("Negative uploads", () => {
  test("rejects unsupported file types", async () => {
    const baseURL = process.env.E2E_API_BASE || "http://localhost:8080";
    const api = await request.newContext({
      baseURL,
      extraHTTPHeaders: {
        "x-org-id": "org-negative-upload",
      },
    });

    const bootstrap = await api.get("/children/bootstrap");
    expect(bootstrap.ok()).toBeTruthy();
    const child = await bootstrap.json();
    const childId = child.child.id;

    const buffer = fs.readFileSync(path.resolve(__dirname, "../fixtures/malicious.exe"));

    const res = await api.post(`/children/${childId}/documents`, {
      multipart: {
        file: {
          name: "malicious.exe",
          mimeType: "application/octet-stream",
          buffer,
        },
      },
    });

    expect(res.status()).toBe(415);
    const json = await res.json();
    expect(json.error).toBe("unsupported_type");
  });
});
