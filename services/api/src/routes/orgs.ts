import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { isUuid } from "../lib/child.js";
import { getFeaturesForPlan } from "../lib/entitlements.js";

const DEFAULT_PLAN = "free";

export default async function routes(app: FastifyInstance) {
  app.post("/orgs/bootstrap", async (req, reply) => {
    const user: any = (req as any).user || {};
    const userId = typeof user?.id === "string" ? user.id.trim() : "";
    const email = typeof user?.email === "string" ? user.email.trim() : "";
    const claimedOrg = typeof user?.org_id === "string" ? user.org_id.trim() : "";
    if (!userId || !isUuid(claimedOrg)) {
      return reply.code(400).send({ error: "org_context_unresolved" });
    }

    const body = (req.body as any) || {};
    const requestedName = typeof body?.org_name === "string" ? body.org_name.trim() : "";
    const safeName = (requestedName || email || "Joslyn Family").slice(0, 120);
    const requestedRole = typeof body?.role === "string" && body.role.trim() ? body.role.trim() : "owner";

    const org = await (prisma as any).orgs.upsert({
      where: { id: claimedOrg },
      update: { name: safeName },
      create: { id: claimedOrg, name: safeName },
      select: { id: true, name: true, created_at: true },
    });

    const membership = await (prisma as any).org_members.upsert({
      where: { org_id_user_id: { org_id: claimedOrg, user_id: userId } },
      update: { role: requestedRole },
      create: { org_id: claimedOrg, user_id: userId, role: requestedRole },
      select: { id: true, role: true, created_at: true },
    });

    const features = getFeaturesForPlan(DEFAULT_PLAN);
    await (prisma as any).entitlements.upsert({
      where: { org_id: claimedOrg },
      update: { plan: DEFAULT_PLAN, features_json: features },
      create: { org_id: claimedOrg, plan: DEFAULT_PLAN, features_json: features },
    });

    return reply.send({
      ok: true,
      org: { id: org.id, name: org.name },
      membership: { id: membership.id, role: membership.role },
      plan: DEFAULT_PLAN,
    });
  });
}
