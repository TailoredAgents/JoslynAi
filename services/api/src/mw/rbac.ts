import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";

export default async function rbac(app: FastifyInstance) {
  (app as any).decorateRequest("requireRole", async function (this: any, org_id: string, roles: string[]) {
    const user_id = this.user?.id;
    if (!user_id) throw (app as any).httpErrors.unauthorized();
    const m = await (prisma as any).org_members.findFirst({ where: { org_id, user_id }, select: { role: true } });
    if (!m || !roles.includes(m.role)) {
      throw (app as any).httpErrors.forbidden("insufficient_role");
    }
  });
}

