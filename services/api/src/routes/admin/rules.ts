import { FastifyInstance } from "fastify";
import { prisma } from "../../lib/db.js";
import dayjs from "dayjs";

export default async function routes(app: FastifyInstance) {
  // Enforce RBAC via session/JWT; no client-side admin keys
  app.addHook("onRequest", async (req, reply) => {
    const org_id = (req as any).user?.org_id || null;
    // @ts-ignore
    if (typeof (req as any).requireRole === 'function' && org_id) {
      await (req as any).requireRole(org_id, ["owner", "admin"]);
    } else {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.get("/admin/rules", async (_req, reply) => {
    const org_id = (reply.request as any).user?.org_id || "demo-org";
    // RBAC already enforced in hook
    const rules = await (prisma as any).timeline_rules.findMany({ orderBy: { jurisdiction: "asc" } });
    return reply.send(rules);
  });

  app.patch<{ Params: { id: string } }>("/admin/rules/:id", async (req, reply) => {
    const org_id = (req as any).user?.org_id || "demo-org";
    // RBAC already enforced in hook
    const id = (req.params as any).id;
    const { delta_days, description, source_url, active } = (req.body as any);
    const updated = await (prisma as any).timeline_rules.update({ where: { id }, data: { delta_days, description, source_url, active } });
    return reply.send(updated);
  });

  app.post("/admin/rules/apply", async (req, reply) => {
    const org_id = (req as any).user?.org_id || "demo-org";
    // RBAC already enforced in hook
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


