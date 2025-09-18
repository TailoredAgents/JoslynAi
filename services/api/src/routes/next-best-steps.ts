import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { orgIdFromRequest, resolveChildId } from "../lib/child.js";
import crypto from "node:crypto";

export default async function routes(app: FastifyInstance) {
  app.get("/next-best-steps", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const requestedChild = (req.query as any)?.child_id;
    const childId = requestedChild ? await resolveChildId(requestedChild, orgId) : undefined;

    if (requestedChild && !childId) {
      return reply.code(404).send({ error: "child_not_found" });
    }

    const rows = await (prisma as any).next_best_steps.findMany({
      where: {
        org_id: orgId,
        child_id: childId,
        dismissed_at: null,
        OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
      },
      orderBy: { suggested_at: "desc" },
      take: 6,
    });
    return reply.send(rows);
  });

  app.post("/next-best-steps/generate", async (req, reply) => {
    const { child_id: requestedChild } = (req.body as any);
    const orgId = orgIdFromRequest(req as any);
    const childId = await resolveChildId(requestedChild, orgId);

    if (!childId) {
      return reply.code(404).send({ error: "child_not_found" });
    }

    const created: any[] = [];
    const now = Date.now();
    // (1) deadlines due within 14 days
    const soon = await (prisma as any).deadlines.findMany({ where: { org_id: orgId, child_id: childId, due_date: { lte: new Date(now + 14 * 86400000), gte: new Date(now) } } });
    for (const d of soon) {
      const payload = { deadline_id: d.id, due_date: d.due_date, ics: `/deadlines/${d.id}/ics` };
      const key = crypto.createHash("sha1").update(`${childId}:deadline_upcoming:${JSON.stringify({ deadline_id: d.id })}`).digest("hex");
      const row = await (prisma as any).next_best_steps.upsert({
        where: { child_id_kind_dedupe_key: { child_id: childId, kind: "deadline_upcoming", dedupe_key: key } } as any,
        create: { org_id: orgId, child_id: childId, kind: "deadline_upcoming", payload_json: payload, dedupe_key: key, suggested_at: new Date(), expires_at: new Date(now + 14 * 86400000) },
        update: { payload_json: payload, expires_at: new Date(now + 14 * 86400000) },
      });
      created.push(row);
    }
    // (2) EOB denial scoped to this child/org
    let hasDenial = false;
    try {
      const claims = await (prisma as any).claims.findMany({
        where: { child_id: childId, org_id: orgId },
        select: { id: true },
      });
      const claimIds = (claims || []).map((c: any) => c.id).filter(Boolean);
      if (claimIds.length) {
        const eobs = await (prisma as any).eobs.findMany({
          where: { claim_id: { in: claimIds }, org_id: orgId },
        });
        hasDenial = (eobs || []).some((e: any) => {
          const reason = (e as any)?.parsed_json?.denial_reason;
          return reason != null && String(reason).trim().length > 0;
        });
      }
    } catch {}
    if (hasDenial) {
      const payload = { action: "appeal_packet" };
      const key = crypto.createHash("sha1").update(`${childId}:appeal_recommended:${JSON.stringify(payload)}`).digest("hex");
      const row = await (prisma as any).next_best_steps.upsert({
        where: { child_id_kind_dedupe_key: { child_id: childId, kind: "appeal_recommended", dedupe_key: key } } as any,
        create: { org_id: orgId, child_id: childId, kind: "appeal_recommended", payload_json: payload, dedupe_key: key, suggested_at: new Date() },
        update: { payload_json: payload },
      });
      created.push(row);
    }
    return reply.send(created);
  });

  app.post<{ Params: { id: string } }>("/next-best-steps/:id/accept", async (req, reply) => {
    const id = (req.params as any).id;
    const orgId = orgIdFromRequest(req as any);
    const result = await (prisma as any).next_best_steps.updateMany({ where: { id, org_id: orgId }, data: { accepted_at: new Date() } });
    if (!result?.count) {
      return reply.code(404).send({ error: "not_found" });
    }
    return reply.send({ ok: true });
  });

  app.post<{ Params: { id: string } }>("/next-best-steps/:id/dismiss", async (req, reply) => {
    const id = (req.params as any).id;
    const orgId = orgIdFromRequest(req as any);
    const result = await (prisma as any).next_best_steps.updateMany({ where: { id, org_id: orgId }, data: { dismissed_at: new Date() } });
    if (!result?.count) {
      return reply.code(404).send({ error: "not_found" });
    }
    return reply.send({ ok: true });
  });
}
