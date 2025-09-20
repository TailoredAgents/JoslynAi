import { FastifyInstance } from "fastify";
import { prisma } from "../../lib/db.js";

export default async function routes(app: FastifyInstance) {
  // Internal-only: require exact INTERNAL_API_KEY
  app.addHook("onRequest", async (req, reply) => {
    const key = (req.headers["x-internal-key"] as string | undefined) || undefined;
    if (!key || key !== process.env.INTERNAL_API_KEY) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.patch<{ Params: { id: string } }>("/internal/jobs/:id", async (req, reply) => {
    const { status, error_text, payload, type } = (req.body as any);
    const updates: Record<string, any> = {};
    if (typeof status === "string" && status.trim()) updates.status = status.trim();
    if (typeof type === "string" && type.trim()) updates.type = type.trim();
    if (error_text !== undefined) updates.error_text = error_text ?? null;
    if (payload !== undefined) updates.payload_json = payload;
    if (!Object.keys(updates).length) {
      return reply.status(400).send({ error: "no_update_fields" });
    }
    try {
      const row = await (prisma as any).job_runs.update({ where: { id: (req.params as any).id }, data: updates });
      return reply.send({ ok: true, job: row });
    } catch (err: any) {
      if (err?.code === "P2025") return reply.status(404).send({ error: "not_found" });
      throw err;
    }
  });
}

