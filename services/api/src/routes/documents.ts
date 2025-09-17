import { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import crypto from "node:crypto";
import { prisma } from "../lib/db.js";
import { putObject } from "../lib/s3.js";
import { enqueue } from "../lib/redis.js";\nimport { orgIdFromRequest, resolveChildId } from "../lib/child.js";

function guessDocType(filename: string) {
  const f = filename.toLowerCase();
  if (f.includes("eob")) return "eob";
  if (f.includes("denial")) return "denial_letter";
  if (f.includes("iep")) return "iep";
  return "other";
}

export default async function routes(fastify: FastifyInstance) {
  await fastify.register(multipart);

  fastify.post<{ Params: { id: string } }>("/children/:id/documents", async (req, reply) => {
    const data = await (req as any).file?.();
    if (!data) return reply.status(400).send({ error: "No file uploaded" });
    const childInput = req.params.id;
    const orgId = orgIdFromRequest(req);
    const childId = await resolveChildId(childInput, orgId);
    if (!childId) {
      return reply.status(404).send({ error: "child_not_found" });
    }

    const chunks: Buffer[] = [];
    for await (const ch of data.file) chunks.push(ch as Buffer);
    const buf = Buffer.concat(chunks);

    const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
    const key = `${childId}/${Date.now()}_${data.filename}`;

    await putObject(key, buf, data.mimetype);

    // Prefer using Prisma model if available; fallback to raw insert
    let documentId: string | undefined;
    try {
      // @ts-ignore - depending on Prisma model naming, this may not exist yet
      const doc = await (prisma as any).documents?.create?.({
        data: {
          child_id: childId,
          type: guessDocType(data.filename),
          storage_uri: key,
          sha256,
          doc_tags: [],
          original_name: data.filename,
          version: 1,
        },
        select: { id: true },
      });
      documentId = doc?.id;
    } catch {}

    // dedupe by sha256+child
    if (!documentId) {
      const existing = await (prisma as any).documents.findFirst?.({ where: { child_id: childId, sha256 } }).catch(()=>null);
      if (existing?.id) {
        return reply.send({ document_id: existing.id, storage_key: existing.storage_uri });
      }
      // compute version by child+type
      let version = 1;
      try {
        const sameType = await (prisma as any).documents.findMany({ where: { child_id: childId, type: guessDocType(data.filename) }, select: { version: true } });
        const maxV = Math.max(0, ...sameType.map((x:any)=>x.version||0));
        version = maxV + 1;
      } catch {}
      const row = await prisma.$queryRawUnsafe(
        `INSERT INTO documents (child_id, type, storage_uri, sha256, doc_tags, original_name, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        childId,
        guessDocType(data.filename),
        key,
        sha256,
        JSON.stringify([]),
        data.filename,
        version
      ) as any as { id: string }[];
      documentId = (row as any)[0]?.id;
    }

    if (!documentId) return reply.status(500).send({ error: "Failed to persist document" });

    // Create job run for tracking
    let jobId: string | null = null;
    try {
      const job = await (prisma as any).job_runs.create({
        data: { child_id: childId, type: "upload", status: "pending", payload_json: { history: [], document_id: documentId, filename: data.filename } },
        select: { id: true }
      });
      jobId = job?.id || null;
    } catch {}

    await enqueue({ kind: "ingest_pdf", document_id: documentId, s3_key: key, child_id: childId, filename: data.filename, job_id: jobId });

    return reply.send({ document_id: documentId, storage_key: key, job_id: jobId });
  });

  // Spans by document/page to aid highlighter
  fastify.get<{ Params: { id: string }, Querystring: { page?: string } }>("/documents/:id/spans", async (req, reply) => {
    const { id } = req.params as any;
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




