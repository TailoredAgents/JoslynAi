import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";

export default async function routes(app: FastifyInstance) {
  app.get("/whoami", async (req, reply) => {
    const u: any = (req as any).user || {};
    const org_id = (req as any).orgId || u?.org_id || null;
    let membership: any = null;
    try {
      if (u?.id && org_id) {
        membership = await (prisma as any).org_members.findFirst({ where: { user_id: u.id, org_id }, select: { role: true } });
      }
    } catch {}

    return reply.send({
      ok: true,
      user: { id: u?.id || null, email: u?.email || null, role: u?.role || null },
      org_id,
      membership_role: membership?.role || null,
    });
  });
}

