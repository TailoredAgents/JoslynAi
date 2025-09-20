import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { enqueue } from "../lib/redis.js";
import { orgIdFromRequest, resolveChildId } from "../lib/child.js";

function serializeOutline(row: any) {
  if (!row) return null;
  const outline = row.outline_json || {};
  return {
    id: row.id,
    status: row.status,
    outline_kind: row.outline_kind,
    child_id: row.child_id,
    document_id: outline.document_id || null,
    outline: {
      summary: outline.summary || "",
      facts: Array.isArray(outline.facts) ? outline.facts : [],
      attempts: Array.isArray(outline.attempts) ? outline.attempts : [],
      remedies: Array.isArray(outline.remedies) ? outline.remedies : [],
      next_steps: Array.isArray(outline.next_steps) ? outline.next_steps : [],
      closing: outline.closing || "",
    },
    citations: Array.isArray(row.citations_json) ? row.citations_json : [],
    updated_at: row.updated_at,
  };
}

async function findDefaultDocument(childId: string) {
  const evalDoc = await (prisma as any).documents.findFirst({
    where: { child_id: childId, type: "eval_report" },
    orderBy: [{ created_at: "desc" }],
    select: { id: true },
  });
  if (evalDoc?.id) return evalDoc.id;
  const iepDoc = await (prisma as any).documents.findFirst({
    where: { child_id: childId, type: "iep" },
    orderBy: [{ version: "desc" }, { created_at: "desc" }],
    select: { id: true },
  });
  if (iepDoc?.id) return iepDoc.id;
  const anyDoc = await (prisma as any).documents.findFirst({
    where: { child_id: childId },
    orderBy: [{ created_at: "desc" }],
    select: { id: true },
  });
  return anyDoc?.id || null;
}

export default async function routes(app: FastifyInstance) {
  app.get<{ Params: { childId: string } }>("/children/:childId/advocacy/outlines", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const childId = await resolveChildId((req.params as any).childId, orgId);
    if (!childId) {
      return reply.status(404).send({ error: "child_not_found" });
    }
    const rows = await (prisma as any).advocacy_outlines.findMany({
      where: { child_id: childId },
      orderBy: { updated_at: "desc" },
    });
    return reply.send({ outlines: rows.map((row: any) => serializeOutline(row)) });
  });

  app.post<{ Params: { childId: string }; Body: { document_id?: string; outline_kind?: string } }>("/children/:childId/advocacy/outlines", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const childId = await resolveChildId((req.params as any).childId, orgId);
    if (!childId) {
      return reply.status(404).send({ error: "child_not_found" });
    }
    const payload = (req.body as any) || {};
    let documentId = payload.document_id || null;
    const outlineKind = (payload.outline_kind || "mediation").toLowerCase();
    if (!documentId) {
      documentId = await findDefaultDocument(childId);
    }
    if (!documentId) {
      return reply.status(400).send({ error: "no_document_found" });
    }

    const outline = await (prisma as any).advocacy_outlines.create({
      data: {
        child_id: childId,
        org_id: orgId,
        outline_kind: outlineKind,
        outline_json: {
          document_id: documentId,
          outline_kind: outlineKind,
          summary: "",
          facts: [],
          attempts: [],
          remedies: [],
          next_steps: [],
          closing: "",
        },
        citations_json: [],
        status: "pending",
      },
    });

    await enqueue({
      kind: "build_advocacy_outline",
      outline_id: outline.id,
      child_id: childId,
      org_id: orgId,
      document_id: documentId,
      outline_kind: outlineKind,
    });

    return reply.send({ outline: serializeOutline(outline) });
  });

  app.post<{ Params: { outlineId: string }; Body: { document_id?: string } }>("/advocacy/outlines/:outlineId/regenerate", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const outlineId = (req.params as any).outlineId;
    const payload = (req.body as any) || {};
    const outline = await (prisma as any).advocacy_outlines.findFirst({ where: { id: outlineId, org_id: orgId } });
    if (!outline) {
      return reply.status(404).send({ error: "outline_not_found" });
    }
    const childId = outline.child_id;
    if (!childId) {
      return reply.status(400).send({ error: "missing_child" });
    }
    const resolvedChildId = await resolveChildId(childId, orgId);
    if (!resolvedChildId) {
      return reply.status(404).send({ error: "child_not_found" });
    }
    let documentId = payload.document_id || (outline.outline_json?.document_id ?? null);
    if (!documentId) {
      documentId = await findDefaultDocument(resolvedChildId);
    }
    if (!documentId) {
      return reply.status(400).send({ error: "no_document_found" });
    }

    const updatedOutline = await (prisma as any).advocacy_outlines.update({
      where: { id: outlineId },
      data: {
        status: "pending",
        outline_json: {
          ...(outline.outline_json || {}),
          document_id: documentId,
        },
      },
    });

    await enqueue({
      kind: "build_advocacy_outline",
      outline_id: outlineId,
      child_id: resolvedChildId,
      org_id: orgId,
      document_id: documentId,
      outline_kind: outline.outline_kind,
    });

    return reply.send({ outline: serializeOutline(updatedOutline) });
  });

  app.post<{ Params: { outlineId: string }; Body: { status: string } }>("/advocacy/outlines/:outlineId/status", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const outlineId = (req.params as any).outlineId;
    const status = ((req.body as any)?.status || "draft").toLowerCase();
    // @ts-ignore
    if (typeof (req as any).requireRole === 'function') {
      await (req as any).requireRole(orgId, ["owner", "admin"]);
    }
    const existing = await (prisma as any).advocacy_outlines.findFirst({ where: { id: outlineId, org_id: orgId } });
    if (!existing) {
      return reply.status(404).send({ error: "outline_not_found" });
    }
    await (prisma as any).advocacy_outlines.update({
      where: { id: outlineId },
      data: { status },
    });
    return reply.send({ ok: true });
  });
}
