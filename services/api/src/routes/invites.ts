import { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { prisma } from "../lib/db.js";

export default async function routes(app: FastifyInstance) {
  // Create an invite within the caller's current org; requires admin/owner
  app.post("/invites", async (req, reply) => {
    const org_id = (req as any).orgId as string | null;
    if (!org_id) return reply.code(400).send({ error: "org_context_required" });

    // @ts-ignore requireRole decorated by RBAC
    await (req as any).requireRole(org_id, ["owner", "admin"]);

    const { email, role } = (req.body as any);
    if (!email || typeof email !== "string") return reply.code(400).send({ error: "invalid_email" });
    const normRole = String(role || "member").toLowerCase();
    if (!["owner", "admin", "member", "parent"].includes(normRole)) return reply.code(400).send({ error: "invalid_role" });

    const token = crypto.randomBytes(24).toString("hex");
    const row = await (prisma as any).invites.create({ data: { org_id, email: String(email).toLowerCase(), role: normRole, token } });
    return reply.send({ token: row.token });
  });

  // Accept an invite: binds the authenticated user to the invite's org
  app.post("/invites/accept", async (req, reply) => {
    const { token } = (req.body as any);
    const user = (req as any).user || {};
    const user_id = user.id;
    const user_email = (user.email && String(user.email).toLowerCase()) || null;
    if (!user_id) return reply.code(401).send({ error: "unauthenticated" });
    if (!token || typeof token !== "string") return reply.code(400).send({ error: "invalid_token" });

    const inv = await (prisma as any).invites.findUnique({ where: { token }, select: { id: true, org_id: true, email: true, role: true, accepted_at: true } });
    if (!inv) return reply.status(404).send({ error: "not_found" });
    if (inv.accepted_at) return reply.status(400).send({ error: "already_accepted" });
    if (inv.email && user_email && inv.email.toLowerCase() !== user_email) {
      return reply.status(403).send({ error: "email_mismatch" });
    }

    await (prisma as any).org_members.upsert({
      where: { org_id_user_id: { org_id: inv.org_id, user_id } } as any,
      update: { role: inv.role },
      create: { org_id: inv.org_id, user_id, role: inv.role },
    });
    await (prisma as any).invites.update({ where: { id: inv.id }, data: { accepted_at: new Date() } });
    return reply.send({ ok: true, org_id: inv.org_id });
  });
}


