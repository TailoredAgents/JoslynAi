import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { orgIdFromRequest, resolveChildId } from "../lib/child.js";
import { enqueue } from "../lib/redis.js";

function cleanRewrite(row: any) {
  if (!row) return null;
  const rewrite = row.rewrite_json || {};
  return {
    id: row.id,
    status: row.status,
    goal_identifier: row.goal_identifier,
    document_id: row.document_id,
    rubric: Array.isArray(rewrite.rubric) ? rewrite.rubric : [],
    rewrite: rewrite.rewrite || "",
    baseline: rewrite.baseline || "",
    measurement_plan: rewrite.measurement_plan || "",
    citations: Array.isArray(rewrite.citations) ? rewrite.citations : [],
    updated_at: row.updated_at,
  };
}

export default async function routes(app: FastifyInstance) {
  app.get<{ Params: { childId: string }; Querystring: { document_id?: string } }>("/children/:childId/goals/smart", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const childId = await resolveChildId((req.params as any).childId, orgId);
    if (!childId) return reply.status(404).send({ error: "child_not_found" });

    const documentId = (req.query as any)?.document_id;
    const rows = await (prisma as any).goal_rewrites.findMany({
      where: {
        child_id: childId,
        ...(documentId ? { document_id: documentId } : {}),
      },
      orderBy: { updated_at: "desc" },
    });

    return reply.send({ rewrites: rows.map((row: any) => cleanRewrite(row)) });
  });

  app.post<{ Params: { childId: string }; Body: { document_id?: string; goal_identifier: string; goal_text: string } }>("/children/:childId/goals/smart", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const childId = await resolveChildId((req.params as any).childId, orgId);
    if (!childId) return reply.status(404).send({ error: "child_not_found" });

    const { document_id, goal_identifier, goal_text } = (req.body as any) || {};
    if (!goal_identifier || !goal_text) {
      return reply.status(400).send({ error: "goal_required" });
    }

    await enqueue({
      kind: "goal_smart",
      child_id: childId,
      org_id: orgId,
      document_id: document_id || null,
      goal_identifier,
      goal_text,
    });

    await (prisma as any).goal_rewrites.upsert({
      where: { child_id_goal_identifier: { child_id: childId, goal_identifier } } as any,
      update: { status: "pending" },
      create: {
        child_id: childId,
        org_id: orgId,
        document_id: document_id || null,
        goal_identifier,
        rubric_json: [],
        rewrite_json: { rewrite: "", baseline: "", measurement_plan: "", citations: [] },
        citations_json: [],
        status: "pending",
      },
    });

    return reply.send({ ok: true });
  });

  app.post<{ Params: { childId: string; rewriteId: string } }>("/children/:childId/goals/:rewriteId/confirm", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const childId = await resolveChildId((req.params as any).childId, orgId);
    if (!childId) return reply.status(404).send({ error: "child_not_found" });

    const rewriteId = (req.params as any).rewriteId;
    await (prisma as any).goal_rewrites.update({
      where: { id: rewriteId },
      data: { status: "confirmed", confirmed_at: new Date() },
    });

    return reply.send({ ok: true });
  });
}
