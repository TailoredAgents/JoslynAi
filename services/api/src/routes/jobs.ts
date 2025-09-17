import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { orgIdFromRequest, resolveChildId } from "../lib/child.js";

export default async function routes(app: FastifyInstance) {
  app.post("/jobs/enqueue", async (req, reply) => {
    const { child_id, type, payload } = (req.body as any);
    const orgId = orgIdFromRequest(req);
    let childIdValue: string | null = null;
    if (child_id) {
      const resolved = await resolveChildId(child_id, orgId);
      if (!resolved) {
        return reply.status(404).send({ error: "child_not_found" });
      }
      childIdValue = resolved;
    }
    const job = await (prisma as any).job_runs.create({ data: { child_id: childIdValue, org_id: orgId, type, status: "pending", payload_json: payload || {} } });
    return reply.send({ job_id: job.id });
  });

  app.patch<{ Params: { id: string } }>("/jobs/:id", async (req, reply) => {
    const { status, error_text, payload } = (req.body as any);
    const row = await (prisma as any).job_runs.update({ where: { id: (req.params as any).id }, data: { status, error_text: error_text || null, payload_json: payload || undefined } });
    return reply.send({ ok: true, job: row });
  });

  app.get("/jobs", async (req, reply) => {
    const orgId = orgIdFromRequest(req);
    const childIdentifier = (req.query as any)?.child_id;
    const where: any = {};
    if (childIdentifier) {
      const resolved = await resolveChildId(childIdentifier, orgId);
      if (!resolved) {
        return reply.send([]);
      }
      where.child_id = resolved;
    }
    const rows = await (prisma as any).job_runs.findMany({ where, orderBy: { created_at: "desc" }, take: 10 });
    return reply.send(rows);
  });

  app.get<{ Params: { id: string } }>("/jobs/:id", async (req, reply) => {
    const row = await (prisma as any).job_runs.findUnique({ where: { id: (req.params as any).id } });
    if (!row) return reply.status(404).send({ error: "not_found" });
    return reply.send(row);
  });
}






