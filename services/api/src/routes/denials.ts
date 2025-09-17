import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { orgIdFromRequest, resolveChildId } from "../lib/child.js";
import { enqueue } from "../lib/redis.js";

function serializeExplanation(row: any) {
  if (!row) return null;
  const explanation = row.explanation_json || {};
  return {
    id: row.id,
    status: row.status,
    overview: explanation.overview || "",
    codes: Array.isArray(explanation.codes) ? explanation.codes : [],
    appeal_recommended: Boolean(explanation.appeal_recommended),
    appeal_reason: explanation.appeal_reason || null,
    next_steps: Array.isArray(row.next_steps_json) ? row.next_steps_json : [],
    citations: Array.isArray(row.citations_json) ? row.citations_json : [],
    eob_id: row.eob_id,
    document_id: row.document_id,
    updated_at: row.updated_at,
  };
}

async function latestExplanation(childId: string) {
  const rows = await (prisma as any).$queryRawUnsafe(
    `SELECT de.*, de.updated_at, e.document_id
       FROM denial_explanations de
       JOIN eobs e ON e.id = de.eob_id
       JOIN claims c ON c.id = e.claim_id
      WHERE c.child_id = $1
      ORDER BY de.updated_at DESC
      LIMIT 1`,
    childId
  );
  return rows?.[0] ?? null;
}

async function latestEob(childId: string) {
  const rows = await (prisma as any).$queryRawUnsafe(
    `SELECT e.id as eob_id, e.document_id, c.org_id
       FROM eobs e
       JOIN claims c ON c.id = e.claim_id
      WHERE c.child_id = $1
      ORDER BY e.created_at DESC
      LIMIT 1`,
    childId
  );
  return rows?.[0] ?? null;
}

export default async function routes(app: FastifyInstance) {
  app.get<{ Params: { childId: string } }>("/children/:childId/denials/latest", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const childId = await resolveChildId((req.params as any).childId, orgId);
    if (!childId) return reply.status(404).send({ error: "child_not_found" });

    const row = await latestExplanation(childId);
    if (!row) {
      return reply.send({ status: "missing", explanation: null });
    }
    return reply.send({ status: row.status, explanation: serializeExplanation(row) });
  });

  app.get<{ Params: { childId: string; eobId: string } }>("/children/:childId/denials/:eobId/explanation", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const childId = await resolveChildId((req.params as any).childId, orgId);
    const eobId = (req.params as any).eobId;
    if (!childId) return reply.status(404).send({ error: "child_not_found" });

    const row = await (prisma as any).denial_explanations.findFirst({ where: { eob_id: eobId } });
    if (!row) {
      return reply.send({ status: "missing", explanation: null });
    }
    return reply.send({ status: row.status, explanation: serializeExplanation(row) });
  });

  app.post<{ Params: { childId: string; eobId?: string } }>("/children/:childId/denials/regenerate", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const childId = await resolveChildId((req.params as any).childId, orgId);
    if (!childId) return reply.status(404).send({ error: "child_not_found" });

    let eobId = (req.body as any)?.eob_id || (req.params as any).eobId;
    let documentId = (req.body as any)?.document_id;
    let orgForJob = orgId;

    if (!eobId || !documentId) {
      const latest = await latestEob(childId);
      if (!latest) {
        return reply.status(400).send({ error: "no_denial_found" });
      }
      eobId = latest.eob_id;
      documentId = latest.document_id;
      orgForJob = latest.org_id || orgId;
    }

    await enqueue({ kind: "denial_explain", eob_id: eobId, document_id: documentId, child_id: childId, org_id: orgForJob });

    await (prisma as any).denial_explanations.upsert({
      where: { eob_id: eobId },
      update: { status: "pending" },
      create: {
        eob_id: eobId,
        document_id: documentId,
        child_id: childId,
        org_id: orgForJob,
        explanation_json: {},
        next_steps_json: [],
        citations_json: [],
        status: "pending",
      },
    });

    return reply.send({ ok: true, eob_id: eobId });
  });
}
