import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { orgIdFromRequest, resolveChildId } from "../lib/child.js";
import { enqueue } from "../lib/redis.js";

function serializeKit(row: any, items?: any[]) {
  return {
    id: row.id,
    status: row.status,
    denial_id: row.denial_id,
    child_id: row.child_id,
    org_id: row.org_id,
    deadline_date: row.deadline_date ? row.deadline_date.toISOString?.() ?? row.deadline_date : null,
    metadata_json: row.metadata_json || {},
    checklist_json: row.checklist_json || [],
    citations_json: row.citations_json || [],
    updated_at: row.updated_at ? row.updated_at.toISOString?.() ?? row.updated_at : null,
    items: items?.map((item) => ({
      id: item.id,
      kind: item.kind,
      status: item.status,
      payload_json: item.payload_json || {},
      citations_json: item.citations_json || [],
    })) || [],
  };
}

export default async function routes(app: FastifyInstance) {
  app.get("/appeals/kits", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const childIdParam = (req.query as any)?.child_id;
    let childId: string | null = null;
    if (childIdParam) {
      childId = await resolveChildId(childIdParam, orgId);
      if (!childId) {
        return reply.status(404).send({ error: "child_not_found" });
      }
    }

    const kits = await (prisma as any).appeal_kits.findMany({
      where: {
        org_id: orgId,
        ...(childId ? { child_id: childId } : {}),
      },
      orderBy: { updated_at: "desc" },
    });

    return reply.send({ kits: kits.map((kit: any) => serializeKit(kit)) });
  });

  app.get<{ Params: { id: string } }>("/appeals/kits/:id", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const kit = await (prisma as any).appeal_kits.findFirst({ where: { id: (req.params as any).id, org_id: orgId } });
    if (!kit) {
      return reply.status(404).send({ error: "not_found" });
    }
    const items = await (prisma as any).appeal_kit_items.findMany({
      where: { appeal_kit_id: kit.id },
      orderBy: { created_at: "asc" },
    });
    return reply.send({ kit: serializeKit(kit, items) });
  });

  app.post("/appeals/kits", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const { child_id, eob_id, document_id, deadline_date } = (req.body as any) || {};
    if (!child_id) return reply.status(400).send({ error: "child_required" });
    const childId = await resolveChildId(child_id, orgId);
    if (!childId) return reply.status(404).send({ error: "child_not_found" });

    let denialId = eob_id;
    let docId = document_id;
    if (!denialId || !docId) {
      const latest = await (prisma as any).$queryRawUnsafe(
        `SELECT e.id as eob_id, e.document_id
           FROM eobs e
           JOIN claims c ON c.id = e.claim_id
          WHERE c.child_id = $1
          ORDER BY e.created_at DESC
          LIMIT 1`,
        childId
      );
      const candidate = latest?.[0];
      if (!candidate) {
        return reply.status(400).send({ error: "no_denial_found" });
      }
      denialId = candidate.eob_id;
      docId = candidate.document_id;
    }

    const kit = await (prisma as any).appeal_kits.create({
      data: {
        child_id: childId,
        org_id: orgId,
        denial_id: denialId,
        deadline_date: deadline_date ? new Date(deadline_date) : null,
        status: "pending",
        metadata_json: {},
        checklist_json: [],
        citations_json: [],
      },
    });

    await enqueue({ kind: "build_appeal_kit", kit_id: kit.id, child_id: childId, org_id: orgId });

    return reply.send({ id: kit.id, status: kit.status });
  });

  app.post<{ Params: { id: string } }>("/appeals/kits/:id/regenerate", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const kit = await (prisma as any).appeal_kits.findFirst({ where: { id: (req.params as any).id, org_id: orgId } });
    if (!kit) return reply.status(404).send({ error: "not_found" });

    await (prisma as any).appeal_kits.update({ where: { id: kit.id }, data: { status: "pending" } });
    await enqueue({ kind: "build_appeal_kit", kit_id: kit.id, child_id: kit.child_id, org_id: orgId });

    return reply.send({ ok: true, id: kit.id });
  });
}
