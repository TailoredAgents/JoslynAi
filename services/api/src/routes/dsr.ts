import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { orgIdFromRequest } from "../lib/child.js";

export default async function routes(app: FastifyInstance) {
  app.get("/me/export", async (req, reply) => {
    const user = (req as any).user || {};
    const userId = (user.id as string) || "demo-user";
    const orgId = orgIdFromRequest(req as any);

    try {
      const [children, docs, letters, claims, eobs, deadlines, events] = await Promise.all([
        (prisma as any).children.findMany({ where: { org_id: orgId } }),
        (prisma as any).documents.findMany({ where: { org_id: orgId } }),
        (prisma as any).letters.findMany({ where: { org_id: orgId } }),
        (prisma as any).claims.findMany({ where: { org_id: orgId } }),
        (prisma as any).eobs.findMany({ where: { org_id: orgId } }),
        (prisma as any).deadlines.findMany({ where: { org_id: orgId } }),
        (prisma as any).events.findMany({ where: { org_id: orgId, user_id: userId } }),
      ]);

      return reply.send({
        user_id: userId,
        org_id: orgId,
        children,
        docs,
        letters,
        claims,
        eobs,
        deadlines,
        events,
      });
    } catch (e) {
      app.log.error({ err: e, userId, orgId }, "dsr export failed");
      return reply.code(500).send({ error: "export_failed" });
    }
  });

  app.delete("/me/delete", async (req, reply) => {
    const user = (req as any).user || {};
    const userId = (user.id as string) || "demo-user";
    const orgId = orgIdFromRequest(req as any);

    try {
      const deleted = await (prisma as any).events.deleteMany({ where: { org_id: orgId, user_id: userId } });
      return reply.send({ ok: true, deleted_events: deleted?.count ?? 0 });
    } catch (e) {
      app.log.error({ err: e, userId, orgId }, "dsr delete failed");
      return reply.code(500).send({ error: "delete_failed" });
    }
  });
}
