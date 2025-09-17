import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { orgIdFromRequest, resolveChildId } from "../lib/child.js";
import { enqueue } from "../lib/redis.js";

function safeArray<T>(value: any, take?: number): T[] {
  if (!Array.isArray(value)) return [];
  if (typeof take === "number" && take > 0) {
    return value.slice(0, take);
  }
  return value;
}

function iso(value: any) {
  try {
    return value ? new Date(value).toISOString() : null;
  } catch {
    return null;
  }
}

export default async function routes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/children/:id/iep/diff", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const childId = await resolveChildId((req.params as any).id, orgId);
    if (!childId) {
      return reply.status(404).send({ error: "child_not_found" });
    }

    const diff = await (prisma as any).iep_diffs.findFirst({
      where: { child_id: childId },
      orderBy: { created_at: "desc" },
    });

    if (!diff) {
      return reply.send({ status: "missing", summary: null, risk_flags: [], citations: [] });
    }

    const payload = (diff as any).diff_json || {};
    const risk = (diff as any).risk_flags_json || [];
    const citations = (diff as any).citations_json || [];

    return reply.send({
      status: diff.status,
      summary: payload.summary || null,
      minutes_changes: safeArray(payload.minutes_changes, 4),
      goals_added: safeArray(payload.goals_added, 4),
      goals_removed: safeArray(payload.goals_removed, 4),
      accommodations_changed: safeArray(payload.accommodations_changed, 4),
      other_notes: safeArray(payload.other_notes, 3),
      risk_flags: risk,
      citations,
      latest_document_id: diff.latest_document_id,
      previous_document_id: diff.previous_document_id,
      updated_at: iso(diff.updated_at),
    });
  });

  app.get<{ Params: { id: string } }>("/children/:id/iep/diff/view", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const childId = await resolveChildId((req.params as any).id, orgId);
    if (!childId) {
      return reply.status(404).send({ error: "child_not_found" });
    }

    const diff = await (prisma as any).iep_diffs.findFirst({
      where: { child_id: childId },
      orderBy: { created_at: "desc" },
    });

    if (!diff) {
      return reply.send({ status: "missing", diff: null, risk_flags: [], citations: [] });
    }

    return reply.send({
      id: diff.id,
      status: diff.status,
      diff: (diff as any).diff_json || {},
      risk_flags: (diff as any).risk_flags_json || [],
      citations: (diff as any).citations_json || [],
      latest_document_id: diff.latest_document_id,
      previous_document_id: diff.previous_document_id,
      created_at: iso(diff.created_at),
      updated_at: iso(diff.updated_at),
    });
  });

  app.post<{ Params: { id: string }; Body: { document_id?: string } }>("/children/:id/iep/diff/regenerate", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const childId = await resolveChildId((req.params as any).id, orgId);
    if (!childId) {
      return reply.status(404).send({ error: "child_not_found" });
    }

    const explicitDoc = (req.body as any)?.document_id;
    let targetDocId = explicitDoc;

    if (!targetDocId) {
      const latest = await (prisma as any).documents.findFirst({
        where: { child_id: childId, type: "iep" },
        orderBy: [{ version: "desc" }, { created_at: "desc" }],
        select: { id: true },
      });
      targetDocId = latest?.id;
    }

    if (!targetDocId) {
      return reply.status(400).send({ error: "no_iep_document" });
    }

    await enqueue({
      kind: "prep_iep_diff",
      document_id: targetDocId,
      child_id: childId,
      org_id: orgId,
    });

    return reply.send({ ok: true, document_id: targetDocId });
  });
}
