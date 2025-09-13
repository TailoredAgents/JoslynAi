import { FastifyInstance } from "fastify";
import { prisma } from "../../lib/db";

export default async function routes(app: FastifyInstance) {
  app.addHook("onRequest", async (req, reply) => {
    const key = req.headers["x-admin-api-key"] as string | undefined;
    if (!key || key !== process.env.ADMIN_API_KEY) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.get("/admin/deadlines", async (req, reply) => {
    const { child_id, from, to } = (req.query as any) || {};
    const where: any = {};
    if (child_id) where.child_id = child_id;
    if (from || to) where.due_date = {
      gte: from ? new Date(from) : undefined,
      lte: to ? new Date(to) : undefined,
    };

    const rows = await (prisma as any).deadlines.findMany({
      where,
      orderBy: { due_date: "desc" },
      select: {
        id: true, child_id: true, kind: true, base_date: true, due_date: true,
        jurisdiction: true, source_doc_id: true, created_at: true,
      },
    });

    const childIds = Array.from(new Set(rows.map((r: any) => r.child_id))).filter(Boolean);
    const children = childIds.length
      ? await (prisma as any).children.findMany({ where: { id: { in: childIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(children.map((c: any) => [c.id, c.name]));
    const decorated = rows.map((r: any) => ({ ...r, child_name: nameById.get(r.child_id) || null }));
    return reply.send(decorated);
  });
}

