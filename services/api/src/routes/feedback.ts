import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";

export default async function routes(app: FastifyInstance) {
  app.post("/feedback", async (req: any, reply) => {
    const org_id = (req.user?.org_id as string) || null;
    const user_id = (req.user?.id as string) || null;
    const payload = (req.body as any) || {};
    await (prisma as any).events.create({ data: { org_id, user_id, type: "user_feedback", payload_json: payload } });
    return reply.send({ ok: true });
  });
}


