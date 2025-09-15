import { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { prisma } from "../lib/db.js";

export default async function routes(app: FastifyInstance) {
  app.post("/invites", async (req, reply) => {
    const { org_id, email, role } = (req.body as any);
    const token = crypto.randomBytes(16).toString("hex");
    const row = await (prisma as any).invites.create({ data: { org_id, email, role, token } });
    return reply.send({ token: row.token });
  });
  app.post("/invites/accept", async (req, reply) => {
    const { token, user_id } = (req.body as any);
    const inv = await (prisma as any).invites.findUnique({ where: { token } });
    if (!inv) return reply.status(404).send({ error: "not_found" });
    await (prisma as any).org_members.upsert({
      where: { org_id_user_id: { org_id: inv.org_id, user_id } } as any,
      update: { role: inv.role },
      create: { org_id: inv.org_id, user_id, role: inv.role },
    });
    await (prisma as any).invites.update({ where: { id: inv.id }, data: { accepted_at: new Date() } });
    return reply.send({ ok: true });
  });
}


