import { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import crypto from "node:crypto";
import { prisma } from "../lib/db";
import { putObject } from "../lib/s3";
import { enqueue } from "../lib/redis";

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
    const childId = req.params.id;

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
        },
        select: { id: true },
      });
      documentId = doc?.id;
    } catch {}

    if (!documentId) {
      const row = await prisma.$queryRawUnsafe(
        `INSERT INTO documents (child_id, type, storage_uri, sha256, doc_tags)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        childId,
        guessDocType(data.filename),
        key,
        sha256,
        JSON.stringify([])
      ) as any as { id: string }[];
      documentId = (row as any)[0]?.id;
    }

    if (!documentId) return reply.status(500).send({ error: "Failed to persist document" });

    await enqueue({ kind: "ingest_pdf", document_id: documentId, s3_key: key, child_id: childId });

    return reply.send({ document_id: documentId, storage_key: key });
  });
}
