import { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { prisma } from "../lib/db.js";
import { putObject } from "../lib/s3.js";
import { enqueue } from "../lib/redis.js";
import { orgIdFromRequest, resolveChildId } from "../lib/child.js";
import { scanFileForViruses } from "../lib/clamav.js";

function guessDocType(filename: string) {
  const f = filename.toLowerCase();
  if (f.includes("eob")) return "eob";
  if (f.includes("denial")) return "denial_letter";
  if (f.includes("iep")) return "iep";
  return "other";
}

const ALLOWED_EXTENSIONS = (process.env.ALLOWED_UPLOAD_EXT || ".pdf,.doc,.docx,.txt")
  .split(",")
  .map((ext) => ext.trim().toLowerCase())
  .filter(Boolean);

const ALLOWED_MIME_TYPES = (process.env.ALLOWED_UPLOAD_MIME ||
  "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain").split(",")
  .map((mime) => mime.trim().toLowerCase())
  .filter(Boolean);

function sanitizeFilename(input: string) {
  const base = path.basename(input || "upload");
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned || `upload_${Date.now()}.dat`;
}

function isAllowedExtension(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.length) return true;
  return ALLOWED_EXTENSIONS.includes(ext);
}

function isAllowedMime(mime: string | null | undefined) {
  if (!mime) return false;
  if (!ALLOWED_MIME_TYPES.length) return true;
  return ALLOWED_MIME_TYPES.includes(mime.toLowerCase());
}

let fileTypeModulePromise: Promise<typeof import("file-type")> | null = null;
async function detectFileType(filePath: string) {
  if (!fileTypeModulePromise) {
    fileTypeModulePromise = import("file-type");
  }
  const { fileTypeFromFile } = await fileTypeModulePromise;
  return fileTypeFromFile(filePath);
}

export default async function routes(fastify: FastifyInstance) {
  const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 32);
  await fastify.register(multipart, {
    limits: {
      fileSize: MAX_UPLOAD_MB * 1024 * 1024,
      files: 1,
      fields: 20,
    },
  });

  fastify.post<{ Params: { id: string } }>("/children/:id/documents", async (req, reply) => {
    const data = await (req as any).file?.();
    if (!data) return reply.status(400).send({ error: "No file uploaded" });
    const childInput = (req.params as any).id;
    const orgId = orgIdFromRequest(req as any);
    const childId = await resolveChildId(childInput, orgId);
    if (!childId) {
      return reply.status(404).send({ error: "child_not_found" });
    }

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "upload_"));
    const safeName = sanitizeFilename(data.filename || "upload.pdf");
    const tmp = path.join(tmpDir, safeName);

    try {
      // Stream to temp file to avoid buffering entire upload in memory
      await pipeline((data as any).file, fs.createWriteStream(tmp));

      const stats = await fs.promises.stat(tmp);
      if (!stats.size) {
        return reply.status(400).send({ error: "invalid_upload", message: "File is empty" });
      }
      if (stats.size > MAX_UPLOAD_MB * 1024 * 1024) {
        return reply.status(400).send({ error: "invalid_upload", message: "File exceeds maximum size" });
      }

      if (!isAllowedExtension(safeName)) {
        return reply.status(415).send({ error: "unsupported_type", message: "File extension not allowed" });
      }

      try {
        const typeResult = await detectFileType(tmp);
        const detectedMime = typeResult?.mime || data.mimetype || "";
        if (typeResult?.mime && !isAllowedMime(typeResult.mime)) {
          return reply.status(415).send({ error: "unsupported_type", message: `Detected MIME ${typeResult.mime} not allowed` });
        }
        if (!typeResult?.mime && data.mimetype && !isAllowedMime(data.mimetype)) {
          return reply.status(415).send({ error: "unsupported_type", message: `Declared MIME ${data.mimetype} not allowed` });
        }
        if (!typeResult?.mime && !data.mimetype) {
          return reply.status(415).send({ error: "unsupported_type", message: "Cannot determine file type" });
        }
      } catch (err) {
        return reply.status(400).send({ error: "invalid_upload", message: "Failed to inspect file type" });
      }

      try {
        await scanFileForViruses(tmp);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const infected = message.toLowerCase().includes("found");
        return reply.status(infected ? 400 : 500).send({
          error: infected ? "infected_upload" : "scan_failed",
          message,
        });
      }

      // Compute sha256 by streaming temp file
      const sha256 = await new Promise<string>((resolve, reject) => {
        const h = crypto.createHash("sha256");
        const rs = fs.createReadStream(tmp);
        rs.on("data", (d) => h.update(d as Buffer));
        rs.on("error", reject);
        rs.on("end", () => resolve(h.digest("hex")));
      });

      const key = `org/${orgId}/children/${childId}/${Date.now()}_${safeName}`;

      // Prefer using Prisma model if available; fallback to raw insert
      let documentId: string | undefined;
      try {
        const doc = await (prisma as any).documents?.create?.({
          data: {
            child_id: childId,
            org_id: orgId,
            type: guessDocType(data.filename),
            storage_uri: key,
            sha256,
            doc_tags: [],
            original_name: safeName,
            version: 1,
          },
          select: { id: true },
        });
        documentId = (doc as any)?.id;
      } catch {}

      // dedupe by sha256+child
      if (!documentId) {
        const existing = await (prisma as any).documents.findFirst?.({ where: { child_id: childId, sha256, org_id: orgId } }).catch(() => null);
        if ((existing as any)?.id) {
          return reply.send({ document_id: (existing as any).id, storage_key: (existing as any).storage_uri });
        }
        // compute version by child+type
        let version = 1;
        try {
          const sameType = await (prisma as any).documents.findMany({ where: { child_id: childId, type: guessDocType(data.filename) }, select: { version: true } });
          const maxV = Math.max(0, ...sameType.map((x: any) => x.version || 0));
          version = maxV + 1;
        } catch {}
        const row = await prisma.$queryRawUnsafe(
          `INSERT INTO documents (child_id, org_id, type, storage_uri, sha256, doc_tags, original_name, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          childId,
          orgId,
          guessDocType(data.filename),
          key,
          sha256,
          JSON.stringify([]),
          safeName,
          version
        ) as any as { id: string }[];
        documentId = (row as any)[0]?.id;
      }

      if (!documentId) return reply.status(500).send({ error: "Failed to persist document" });

      // Upload to object storage by streaming from temp file
      await putObject(key, fs.createReadStream(tmp), (data as any).mimetype);

      // Create job run for tracking
      let jobId: string | null = null;
      try {
        const job = await (prisma as any).job_runs.create({
          data: { child_id: childId, org_id: orgId, type: "upload", status: "pending", payload_json: { history: [], document_id: documentId, filename: data.filename } },
          select: { id: true }
        });
        jobId = (job as any)?.id || null;
      } catch {}

      await enqueue({ kind: "ingest_pdf", document_id: documentId, s3_key: key, child_id: childId, org_id: orgId, filename: data.filename, job_id: jobId });

      return reply.send({ document_id: documentId, storage_key: key, job_id: jobId });
    } finally {
      try { await fs.promises.unlink(tmp); } catch {}
      try { await fs.promises.rm(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  // Spans by document/page to aid highlighter
  fastify.get<{ Params: { id: string }, Querystring: { page?: string } }>("/documents/:id/spans", async (req, reply) => {
    const { id } = (req.params as any);
    const orgId = orgIdFromRequest(req as any);
    // Assert document belongs to current org; prevents cross-tenant leakage even if RLS session missing
    const doc = await (prisma as any).documents.findFirst({ where: { id, org_id: orgId }, select: { id: true } });
    if (!doc) return reply.status(404).send({ error: "not_found" });
    const page = Number(((req.query as any)?.page || 0));
    const where: any = { document_id: id };
    if (page) where.page = page;
    const spans = await (prisma as any).doc_spans.findMany({
      where,
      select: { id: true, page: true, text: true, bbox: true, document_id: true, page_width: true, page_height: true },
      orderBy: { page: "asc" }
    });
    return reply.send(spans);
  });
}
