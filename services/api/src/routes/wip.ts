import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { orgIdFromRequest, resolveChildId } from "../lib/child.js";

export default async function routes(app: FastifyInstance) {
  app.post("/smart-phrases", async (req, reply) => {
    const { kind, payload } = (req.body as any) || {};
    const orgId = orgIdFromRequest(req as any);
    const childIdInput = (req.body as any)?.child_id;
    const childId = childIdInput ? await resolveChildId(childIdInput, orgId) : null;
    const userId = (req as any).user?.id || null;
    await (prisma as any).smart_phrases.create({
      data: {
        org_id: orgId,
        user_id: userId,
        child_id: childId,
        kind: kind || "note",
        payload_json: payload || {},
      }
    });
    return reply.send({ ok: true });
  });
}
