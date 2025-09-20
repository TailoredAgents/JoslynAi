import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { enqueue } from "../lib/redis.js";
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
    const payloadData: Record<string, any> = payload && typeof payload === "object" ? payload : {};
    const job = await (prisma as any).job_runs.create({ data: { child_id: childIdValue, org_id: orgId, type, status: "pending", payload_json: payloadData } });
    const jobPayload = {
      ...payloadData,
      kind: type,
      type,
      job_id: job.id,
      org_id: orgId,
      child_id: childIdValue ?? payloadData.child_id ?? null,
    };
    try {
      await enqueue(jobPayload);
    } catch (err) {
      (req as any).log?.error?.({ err, jobId: job.id }, "job_enqueue_failed");
      await (prisma as any).job_runs.update({ where: { id: job.id }, data: { status: "error", error_text: "enqueue_failed" } }).catch(() => {});
      return reply.status(500).send({ error: "enqueue_failed" });
    }

    return reply.send({ job_id: job.id });
  });

  app.patch<{ Params: { id: string } }>("/jobs/:id", async (req, reply) => {
    const orgId = orgIdFromRequest(req);
    const { status, error_text, payload, type } = (req.body as any);
    const updates: Record<string, any> = {};
    if (typeof status === "string" && status.trim()) {
      updates.status = status.trim();
    }
    if (typeof type === "string" && type.trim()) {
      updates.type = type.trim();
    }
    if (error_text !== undefined) {
      updates.error_text = error_text ?? null;
    }
    if (payload !== undefined) {
      updates.payload_json = payload;
    }
    if (!Object.keys(updates).length) {
      return reply.status(400).send({ error: "no_update_fields" });
    }
    const id = (req.params as any).id;
    const existing = await (prisma as any).job_runs.findFirst({ where: { id, org_id: orgId } });
    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }
    try {
      const row = await (prisma as any).job_runs.update({ where: { id }, data: updates });
      return reply.send({ ok: true, job: row });
    } catch (err: any) {
      if (err?.code === "P2025") {
        return reply.status(404).send({ error: "not_found" });
      }
      throw err;
    }
  });

  app.get("/jobs", async (req, reply) => {
    const orgId = orgIdFromRequest(req);
    const childIdentifier = (req.query as any)?.child_id;
    const where: any = { org_id: orgId };
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
    const orgId = orgIdFromRequest(req);
    const row = await (prisma as any).job_runs.findFirst({ where: { id: (req.params as any).id, org_id: orgId } });
    if (!row) return reply.status(404).send({ error: "not_found" });
    return reply.send(row);
  });
}

