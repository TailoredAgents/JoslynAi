import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db";
import dayjs from "dayjs";

export default async function routes(app: FastifyInstance) {
  app.post("/tools/timeline/compute-and-create", async (req, reply) => {
    const { child_id, kind, base_date, jurisdiction = "US-*" } = (req.body as any);
    const rule = await (prisma as any).timeline_rules.findFirst({
      where: { kind, OR: [{ jurisdiction }, { jurisdiction: "US-*" }], active: true },
      orderBy: [{ jurisdiction: "desc" as const }]
    });
    if (!rule) return reply.status(400).send({ error: "No rule found" });

    const due = dayjs(base_date).add(rule.delta_days, "day").toDate();
    const dl = await (prisma as any).deadlines.create({
      data: { child_id, kind, base_date: new Date(base_date), due_date: due, jurisdiction }
    });
    // audit event
    await (prisma as any).events.create({ data: { org_id: (req as any).orgId || null, type: "deadline_create", payload_json: { child_id, kind, base_date, due_date: due } } });
    return reply.send({ deadline_id: dl.id, due_date: dl.due_date, description: rule.description, source_url: rule.source_url });
  });
}
