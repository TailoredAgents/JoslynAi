import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { ensureChildRecord, ensureUniqueSlug, slugifyCandidate, orgIdFromRequest } from "../lib/child.js";



export default async function routes(app: FastifyInstance) {
  app.get("/children/bootstrap", async (req, reply) => {
    const orgId = orgIdFromRequest(req);
    const identifier = ((req.query as any)?.identifier ?? null) as string | null;
    const child = await ensureChildRecord({ identifier, orgId, fallbackName: 'Demo Child' });
    return reply.send({ child });
  });

  app.post("/children", async (req, reply) => {
    const { name, dob, school_name, slug } = (req.body as any) || {};
    const orgId = orgIdFromRequest(req);
    const safeName = (name ? String(name).trim() : '').slice(0, 120) || 'New Child';
    const slugCandidate = slug ? String(slug).trim() : slugifyCandidate(safeName);
    const uniqueSlug = await ensureUniqueSlug(slugCandidate, orgId);
    const row = await (prisma as any).children.create({
      data: {
        name: safeName,
        slug: uniqueSlug,
        school_name: school_name ? String(school_name).trim() || null : null,
        dob: dob ? new Date(dob) : null,
        org_id: orgId,
      },
    });
    return reply.send({ child_id: row.id, slug: row.slug });
  });
}

