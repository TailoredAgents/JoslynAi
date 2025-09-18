import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { orgIdFromRequest, resolveChildId } from "../lib/child.js";
import { enqueue } from "../lib/redis.js";

function normalizeList(value: any) {
  if (!Array.isArray(value)) return [];
  return value;
}

function serializeRecommendation(row: any) {
  if (!row) return null;
  const data = Array.isArray(row.recommendations_json) ? row.recommendations_json : [];
  return {
    id: row.id,
    status: row.status,
    source_kind: row.source_kind,
    locale: row.locale || "en",
    recommendations: data,
    citations: normalizeList(row.citations_json),
    updated_at: row.updated_at,
  };
}

async function findDocumentForSource(childId: string, source: string) {
  const sourceKind = (source || "auto").toLowerCase();
  if (sourceKind === "iep") {
    return (prisma as any).documents.findFirst({
      where: { child_id: childId, type: "iep" },
      orderBy: [{ version: "desc" }, { created_at: "desc" }],
    });
  }
  if (sourceKind === "evaluation") {
    return (prisma as any).documents.findFirst({
      where: { child_id: childId, type: "eval_report" },
      orderBy: [{ created_at: "desc" }],
    });
  }
  const evalDoc = await (prisma as any).documents.findFirst({
    where: { child_id: childId, type: "eval_report" },
    orderBy: [{ created_at: "desc" }],
  });
  if (evalDoc) return evalDoc;
  const iepDoc = await (prisma as any).documents.findFirst({
    where: { child_id: childId, type: "iep" },
    orderBy: [{ version: "desc" }, { created_at: "desc" }],
  });
  if (iepDoc) return iepDoc;
  return (prisma as any).documents.findFirst({
    where: { child_id: childId },
    orderBy: [{ created_at: "desc" }],
  });
}

export default async function routes(app: FastifyInstance) {
  app.get<{ Params: { childId: string }; Querystring: { source?: string } }>("/children/:childId/recommendations", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const childId = await resolveChildId((req.params as any).childId, orgId);
    if (!childId) return reply.status(404).send({ error: "child_not_found" });

    const source = ((req.query as any)?.source || "auto").toLowerCase();
    const row = await (prisma as any).recommendations.findFirst({
      where: { child_id: childId, source_kind: source },
      orderBy: { updated_at: "desc" },
    });

    if (!row) {
      return reply.send({ status: "missing", record: null });
    }

    return reply.send({ status: row.status, record: serializeRecommendation(row) });
  });

  app.post<{ Params: { childId: string }; Body: { document_id?: string; source?: string } }>("/children/:childId/recommendations/regenerate", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const childId = await resolveChildId((req.params as any).childId, orgId);
    if (!childId) return reply.status(404).send({ error: "child_not_found" });

    const payload = (req.body as any) || {};
    const requestedSource = (payload.source || "auto").toLowerCase();
    let targetDocumentId = payload.document_id;

    if (!targetDocumentId) {
      const doc = await findDocumentForSource(childId, requestedSource);
      if (!doc) {
        return reply.status(400).send({ error: "no_document_found" });
      }
      targetDocumentId = doc.id;
    }

    await enqueue({
      kind: "prep_recommendations",
      child_id: childId,
      org_id: orgId,
      document_id: targetDocumentId,
      source: requestedSource,
    });

    await (prisma as any).recommendations.upsert({
      where: { child_id_source_kind: { child_id: childId, source_kind: requestedSource } } as any,
      update: { status: "pending" },
      create: {
        child_id: childId,
        org_id: orgId,
        source_kind: requestedSource,
        recommendations_json: [],
        citations_json: [],
        request_hash: null,
        locale: "en",
        status: "pending",
      },
    });

    return reply.send({ ok: true, document_id: targetDocumentId, source: requestedSource });
  });
}
