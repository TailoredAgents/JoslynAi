import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db";

export default async function routes(app: FastifyInstance) {
  app.post("/events/consent", async (req, reply) => {
    await (prisma as any).events.create({ data: { org_id: (req as any).user?.org_id || null, user_id: (req as any).user?.id || null, type: "meeting_consent", payload_json: { ip: (req as any).ip } } });
    return reply.send({ ok: true });
  });

  app.post("/feedback", async (req, reply) => {
    const payload = (req.body as any) || {};
    await (prisma as any).events.create({ data: { org_id: (req as any).user?.org_id || null, user_id: (req as any).user?.id || null, type: "user_feedback", payload_json: payload } });
    return reply.send({ ok: true });
  });
}

