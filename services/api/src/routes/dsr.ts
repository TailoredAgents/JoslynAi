import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";

export default async function routes(app: FastifyInstance) {
  app.get("/me/export", async (req, reply) => {
    const userId = (req as any).user?.id || "demo-user";
    try {
      const [children, docs, letters, claims, eobs, deadlines, events] = await Promise.all([
        (prisma as any).children.findMany({}),
        (prisma as any).documents.findMany({}),
        (prisma as any).letters.findMany({}),
        (prisma as any).claims.findMany({}),
        (prisma as any).eobs.findMany({}),
        (prisma as any).deadlines.findMany({}),
        (prisma as any).events.findMany({}),
      ]);
      return reply.send({ children, docs, letters, claims, eobs, deadlines, events, user_id: userId });
    } catch (e) {
      return reply.send({ error: "export_failed", user_id: userId });
    }
  });

  app.delete("/me/delete", async (req, reply) => {
    const userId = (req as any).user?.id || "demo-user";
    try {
      await (prisma as any).events.deleteMany({});
    } catch {}
    return reply.send({ ok: true });
  });
}


