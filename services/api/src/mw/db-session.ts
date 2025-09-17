import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { orgIdFromRequest } from "../lib/child.js";

export default async function dbSession(app: FastifyInstance) {
  app.addHook("preHandler", async (req) => {
    const orgId = orgIdFromRequest(req as any);
    try {
      // Best-effort: set session GUC; note: without a transaction this may land on a different connection.
      await (prisma as any).$executeRawUnsafe(`SELECT set_config('request.jwt.org_id', $1, true)`, orgId || null);
      (req as any).orgId = orgId;
    } catch {}
  });
}

