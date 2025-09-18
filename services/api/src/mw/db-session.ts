import { FastifyInstance } from "fastify";
import { setOrgContext } from "../lib/db.js";
import { orgIdFromRequest } from "../lib/child.js";

export default async function dbSession(app: FastifyInstance) {
  app.addHook("onRequest", async (req) => {
    const orgId = orgIdFromRequest(req as any);
    (req as any).orgId = orgId;
    setOrgContext(orgId);
  });
}
