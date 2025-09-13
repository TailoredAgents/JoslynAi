import { FastifyInstance } from "fastify";
import { prisma } from "../../lib/db";
import dayjs from "dayjs";

export default async function routes(app: FastifyInstance) {
  app.addHook("onRequest", async (req, reply) => {
    const key = req.headers["x-admin-api-key"] as string | undefined;
    if (!key || key !== process.env.ADMIN_API_KEY) return reply.code(401).send({ error: "unauthorized" });
  });

  app.get("/admin/rules", async (_req, reply) => {
    const rules = await (prisma as any).timeline_rules.findMany({ orderBy: { jurisdiction: "asc" } });
    return reply.send(rules);
  });

  app.patch<{ Params: { id: string } }>("/admin/rules/:id", async (req, reply) => {
    const id = (req.params as any).id;
    const { delta_days, description, source_url, active } = (req.body as any);
    const updated = await (prisma as any).timeline_rules.update({ where: { id }, data: { delta_days, description, source_url, active } });
    return reply.send(updated);
  });

  app.post("/admin/deadlines", async (req, reply) => {
    const { child_id, kind, base_date, jurisdiction = "US-*" } = (req.body as any);
    const rule = await (prisma as any).timeline_rules.findFirst({
      where: { kind, OR: [{ jurisdiction }, { jurisdiction: "US-*" }], active: true },
      orderBy: [{ jurisdiction: "desc" as const }]
    });
    if (!rule) return reply.status(400).send({ error: "No rule found" });
    const due = dayjs(base_date).add(rule.delta_days, "day").toDate();
    const dl = await (prisma as any).deadlines.create({ data: { child_id, kind, base_date: new Date(base_date), due_date: due, jurisdiction } });
    await (prisma as any).events.create({ data: { org_id: (req as any).orgId || null, type: "deadline_create_admin", payload_json: { child_id, kind, base_date, due_date: due } } });
    return reply.send(dl);
  });
}

