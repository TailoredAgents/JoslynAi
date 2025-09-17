import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { orgIdFromRequest } from "../lib/child.js";
import crypto from "node:crypto";

export default async function routes(app: FastifyInstance) {
  app.get("/next-best-steps", async (req, reply) => {
    const child_id = (req.query as any)?.child_id;
    const rows = await (prisma as any).next_best_steps.findMany({
      where: { child_id, dismissed_at: null, OR: [ { expires_at: null }, { expires_at: { gt: new Date() } } ] },
      orderBy: { suggested_at: "desc" },
      take: 6,
    });
    return reply.send(rows);
  });

  app.post("/next-best-steps/generate", async (req, reply) => {
    const { child_id } = (req.body as any);
    const org_id = orgIdFromRequest(req as any);
    const created: any[] = [];
    const now = Date.now();
    // (1) deadlines due within 14 days
    const soon = await (prisma as any).deadlines.findMany({ where: { child_id, due_date: { lte: new Date(now + 14*86400000), gte: new Date(now) } } });
    for (const d of soon) {
      const payload = { deadline_id: d.id, due_date: d.due_date, ics: `/deadlines/${d.id}/ics` };
      const key = crypto.createHash('sha1').update(`${child_id}:deadline_upcoming:${JSON.stringify({deadline_id:d.id})}`).digest('hex');
      const row = await (prisma as any).next_best_steps.upsert({
        where: { child_id_kind_dedupe_key: { child_id, kind: "deadline_upcoming", dedupe_key: key } } as any,
        create: { child_id, kind: "deadline_upcoming", payload_json: payload, dedupe_key: key, suggested_at: new Date(), expires_at: new Date(now + 14*86400000) },
        update: { payload_json: payload, expires_at: new Date(now + 14*86400000) }
      });
      created.push(row);
    }
    // (2) EOB denial scoped to this child/org
    let hasDenial = false;
    try {
      const claims = await (prisma as any).claims.findMany({
        where: { child_id, org_id },
        select: { id: true },
      });
      const claimIds = (claims || []).map((c: any) => c.id).filter(Boolean);
      if (claimIds.length) {
        const eobs = await (prisma as any).eobs.findMany({
          where: { claim_id: { in: claimIds }, org_id },
        });
        hasDenial = (eobs || []).some((e: any) => {
          const reason = (e as any)?.parsed_json?.denial_reason;
          return reason != null && String(reason).trim().length > 0;
        });
      }
    } catch {}
    if (hasDenial) {
      const payload = { action: "appeal_packet" };
      const key = crypto.createHash('sha1').update(`${child_id}:appeal_recommended:${JSON.stringify(payload)}`).digest('hex');
      const row = await (prisma as any).next_best_steps.upsert({
        where: { child_id_kind_dedupe_key: { child_id, kind: "appeal_recommended", dedupe_key: key } } as any,
        create: { child_id, kind: "appeal_recommended", payload_json: payload, dedupe_key: key, suggested_at: new Date() },
        update: { payload_json: payload }
      });
      created.push(row);
    }
    return reply.send(created);
  });

  app.post<{ Params: { id: string } }>("/next-best-steps/:id/accept", async (req, reply) => {
    const id = (req.params as any).id;
    await (prisma as any).next_best_steps.update({ where: { id }, data: { accepted_at: new Date() } });
    return reply.send({ ok: true });
  });

  app.post<{ Params: { id: string } }>("/next-best-steps/:id/dismiss", async (req, reply) => {
    const id = (req.params as any).id;
    await (prisma as any).next_best_steps.update({ where: { id }, data: { dismissed_at: new Date() } });
    return reply.send({ ok: true });
  });
}

