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
    // schedule notifications (7d and 2d before)
    const schedule = [7, 2];
    for (const d of schedule) {
      const send_at = new Date(due.getTime() - d * 86400000);
      await (prisma as any).notifications.create({ data: { org_id: (req as any).orgId || null, user_id: null, kind: "deadline_reminder", payload_json: { deadline_id: dl.id, kind, due_date: due }, send_at } });
    }
    return reply.send({ deadline_id: dl.id, due_date: dl.due_date, description: rule.description, source_url: rule.source_url });
  });
}
