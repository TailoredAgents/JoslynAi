import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { enqueue } from "../lib/redis.js";
import { orgIdFromRequest, resolveChildId } from "../lib/child.js";

function serializeSummary(row: any) {
  if (!row) return null;
  const summaryJson = row.summary_json || {};
  return {
    id: row.id,
    status: row.status,
    document_id: row.document_id,
    document_name: row.doc_name || row.doc_type || "Document",
    document_type: row.doc_type || null,
    summary: summaryJson.summary || "",
    teacher_voice: summaryJson.teacher_voice || "",
    caregiver_voice: summaryJson.caregiver_voice || "",
    reading_level: row.reading_level || null,
    glossary: Array.isArray(row.glossary_json) ? row.glossary_json : [],
    citations: Array.isArray(row.citations_json) ? row.citations_json : [],
    updated_at: row.updated_at,
  };
}

export default async function routes(app: FastifyInstance) {
  app.get<{ Params: { childId: string } }>("/children/:childId/research", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const childId = await resolveChildId((req.params as any).childId, orgId);
    if (!childId) {
      return reply.status(404).send({ error: "child_not_found" });
    }

    const rows = await (prisma as any).$queryRawUnsafe(
      `SELECT rs.*, d.original_name AS doc_name, d.type AS doc_type
         FROM research_summaries rs
         JOIN documents d ON d.id = rs.document_id
        WHERE d.child_id = $1
        ORDER BY rs.updated_at DESC` as any,
      childId
    );

    const summaries = Array.isArray(rows) ? rows.map((row: any) => serializeSummary(row)) : [];
    return reply.send({ summaries });
  });

  app.get<{ Params: { id: string } }>("/documents/:id/explain", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const docId = (req.params as any).id;
    if (!docId) {
      return reply.status(400).send({ error: "missing_document" });
    }
    const document = await (prisma as any).documents.findFirst({ where: { id: docId, org_id: orgId } });
    if (!document) {
      return reply.send({ status: "missing", summary: null });
    }
    const summary = await (prisma as any).research_summaries.findUnique({ where: { document_id: docId } });
    if (!summary) {
      return reply.send({ status: "missing", summary: null });
    }
    return reply.send({
      status: summary.status,
      summary: serializeSummary({ ...summary, doc_name: document.original_name, doc_type: document.type }),
    });
  });

  app.post<{ Params: { id: string } }>("/documents/:id/explain", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const docId = (req.params as any).id;
    if (!docId) {
      return reply.status(400).send({ error: "missing_document" });
    }
    const document = await (prisma as any).documents.findFirst({ where: { id: docId, org_id: orgId } });
    if (!document) {
      return reply.status(404).send({ error: "document_not_found" });
    }

    await enqueue({
      kind: "research_summary",
      document_id: docId,
      child_id: document.child_id,
      org_id: document.org_id || orgId,
    });

    await (prisma as any).research_summaries.upsert({
      where: { document_id: docId },
      update: { status: "pending" },
      create: {
        document_id: docId,
        org_id: document.org_id || orgId,
        summary_json: {},
        glossary_json: [],
        citations_json: [],
        reading_level: null,
        status: "pending",
      },
    });

    return reply.send({ ok: true });
  });
}
