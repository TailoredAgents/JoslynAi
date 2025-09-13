import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db";

export default async function routes(app: FastifyInstance) {
  app.post("/jobs/enqueue", async (req, reply) => {
    const { child_id, type, payload } = (req.body as any);
    const job = await (prisma as any).job_runs.create({ data: { child_id, type, status: "pending", payload_json: payload || {} } });
    return reply.send({ job_id: job.id });
  });

  app.patch<{ Params: { id: string } }>("/jobs/:id", async (req, reply) => {
    const { status, error_text, payload } = (req.body as any);
    const row = await (prisma as any).job_runs.update({ where: { id: (req.params as any).id }, data: { status, error_text: error_text || null, payload_json: payload || undefined } });
    return reply.send({ ok: true, job: row });
  });

  app.get("/jobs", async (req, reply) => {
    const child_id = (req.query as any)?.child_id;
    const rows = await (prisma as any).job_runs.findMany({ where: child_id ? { child_id } : {}, orderBy: { created_at: "desc" }, take: 10 });
    return reply.send(rows);
  });

  app.get<{ Params: { id: string } }>("/jobs/:id", async (req, reply) => {
    const row = await (prisma as any).job_runs.findUnique({ where: { id: (req.params as any).id } });
    if (!row) return reply.status(404).send({ error: "not_found" });
    return reply.send(row);
  });
}

