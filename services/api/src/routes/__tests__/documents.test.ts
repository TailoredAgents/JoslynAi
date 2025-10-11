import Fastify from "fastify";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import FormData from "form-data";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const documentsCreate = vi.fn();
const documentsFindFirst = vi.fn();
const documentsFindMany = vi.fn();
const queryRawUnsafe = vi.fn();
const jobRunsCreate = vi.fn();

const resolveChildId = vi.fn(async (id: string) => (id === "missing" ? null : `child-${id}`));
const orgIdFromRequest = vi.fn(() => "org-test");

const putObject = vi.fn(async () => ({}));
const enqueue = vi.fn(async () => {});
const scanFileForViruses = vi.fn(async () => {});
const fileTypeFromFile = vi.fn(async () => ({ mime: "application/pdf" }));

vi.mock("../../lib/db.js", () => ({
  prisma: {
    documents: {
      create: documentsCreate,
      findFirst: documentsFindFirst,
      findMany: documentsFindMany,
    },
    $queryRawUnsafe: queryRawUnsafe,
    job_runs: {
      create: jobRunsCreate,
    },
  },
}));

vi.mock("../../lib/child.js", () => ({
  resolveChildId,
  orgIdFromRequest,
}));

vi.mock("../../lib/s3.js", () => ({
  putObject,
}));

vi.mock("../../lib/redis.js", () => ({
  enqueue,
}));

vi.mock("../../lib/clamav.js", () => ({
  scanFileForViruses,
}));

vi.mock("file-type", () => ({
  fileTypeFromFile,
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, "../../../tests/fixtures");
const samplePdf = path.join(fixturesDir, "sample.pdf");

async function buildServer() {
  const fastify = Fastify();
  const routes = (await import("../documents.js")).default;
  await routes(fastify);
  await fastify.ready();
  return fastify;
}

function buildForm(filePath: string, filename: string) {
  const form = new FormData();
  form.append("file", fs.readFileSync(filePath), {
    filename,
    contentType: "application/pdf",
  });
  return form;
}

describe("documents upload validation", () => {
  beforeEach(() => {
    process.env.ALLOWED_UPLOAD_EXT = ".pdf";
    process.env.ALLOWED_UPLOAD_MIME = "application/pdf";
    documentsCreate.mockResolvedValue({ id: "doc-1" });
    documentsFindFirst.mockResolvedValue(null);
    documentsFindMany.mockResolvedValue([]);
    queryRawUnsafe.mockResolvedValue([{ id: "doc-fallback" }]);
    jobRunsCreate.mockResolvedValue({ id: "job-1" });
    putObject.mockResolvedValue({});
    enqueue.mockResolvedValue(undefined);
    scanFileForViruses.mockResolvedValue(undefined);
    fileTypeFromFile.mockResolvedValue({ mime: "application/pdf" });
    resolveChildId.mockImplementation(async (id: string) => (id === "missing" ? null : `child-${id}`));
  });

  afterEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects when child id cannot be resolved", async () => {
    const fastify = await buildServer();
    const form = buildForm(samplePdf, "sample.pdf");
    const response = await fastify.inject({
      method: "POST",
      url: "/children/missing/documents",
      payload: form.getBuffer(),
      headers: form.getHeaders(),
    });
    expect(response.statusCode).toBe(404);
    expect(documentsCreate).not.toHaveBeenCalled();
    await fastify.close();
  });

  it("rejects files with disallowed extension", async () => {
    const fastify = await buildServer();
    const form = buildForm(samplePdf, "malware.exe");
    const response = await fastify.inject({
      method: "POST",
      url: "/children/abc/documents",
      payload: form.getBuffer(),
      headers: form.getHeaders(),
    });
    expect(response.statusCode).toBe(415);
    expect(response.json().error).toBe("unsupported_type");
    await fastify.close();
  });

  it("rejects when MIME detection returns disallowed type", async () => {
    fileTypeFromFile.mockResolvedValueOnce({ mime: "application/x-msdownload" });
    const fastify = await buildServer();
    const form = buildForm(samplePdf, "sample.pdf");
    const response = await fastify.inject({
      method: "POST",
      url: "/children/abc/documents",
      payload: form.getBuffer(),
      headers: form.getHeaders(),
    });
    expect(response.statusCode).toBe(415);
    expect(response.json().error).toBe("unsupported_type");
    await fastify.close();
  });

  it("rejects when antivirus reports an infection", async () => {
    scanFileForViruses.mockRejectedValueOnce(new Error("Eicar FOUND"));
    const fastify = await buildServer();
    const form = buildForm(samplePdf, "sample.pdf");
    const response = await fastify.inject({
      method: "POST",
      url: "/children/abc/documents",
      payload: form.getBuffer(),
      headers: form.getHeaders(),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("infected_upload");
    await fastify.close();
  });

  it("rejects empty uploads", async () => {
    const tmp = path.join(os.tmpdir(), `empty-${Date.now()}.pdf`);
    fs.writeFileSync(tmp, "");
    const fastify = await buildServer();
    const form = buildForm(tmp, "empty.pdf");
    const response = await fastify.inject({
      method: "POST",
      url: "/children/abc/documents",
      payload: form.getBuffer(),
      headers: form.getHeaders(),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_upload");
    await fastify.close();
    fs.unlinkSync(tmp);
  });

  it("accepts a valid upload and enqueues ingest job", async () => {
    const fastify = await buildServer();
    const form = buildForm(samplePdf, "sample.pdf");
    const response = await fastify.inject({
      method: "POST",
      url: "/children/abc/documents",
      payload: form.getBuffer(),
      headers: form.getHeaders(),
    });
    expect(response.statusCode).toBe(200);
    expect(documentsCreate).toHaveBeenCalled();
    expect(putObject).toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ kind: "ingest_pdf" }));
    await fastify.close();
  });
});
