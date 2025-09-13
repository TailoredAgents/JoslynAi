import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db";

export default async function routes(app: FastifyInstance) {
  app.post("/children", async (req, reply) => {
    const { name, dob, school_name } = (req.body as any) || {};
    const row = await (prisma as any).children.create({ data: { name: name || "New Child", school_name: school_name || null, dob: dob ? new Date(dob) : null, org_id: (req as any).user?.org_id || null } });
    return reply.send({ child_id: row.id });
  });
}

