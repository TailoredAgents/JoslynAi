import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";

export default async function routes(app: FastifyInstance) {
  app.post("/events/consent", async (req: any, reply) => {
    const org_id = (req.user?.org_id as string) || null;
    const user_id = (req.user?.id as string) || null;
    const { child_id, consent = true } = (req.body as any) || {};
    if (!child_id) return reply.status(400).send({ error: "child_id_required" });
    await (prisma as any).events.create({ data: { org_id, user_id, type: "meeting_consent", payload_json: { child_id, consent } } });
    return reply.send({ ok: true });
  });
}


