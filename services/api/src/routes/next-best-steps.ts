import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db";

export default async function routes(app: FastifyInstance) {
  app.get("/next-best-steps", async (req, reply) => {
    const child_id = (req.query as any)?.child_id;
    const rows = await (prisma as any).next_best_steps.findMany({
      where: { child_id, dismissed_at: null, OR: [ { expires_at: null }, { expires_at: { gt: new Date() } } ] },
      orderBy: { suggested_at: "desc" },
      take: 6,
    });
    return reply.send(rows);
  });

  app.post("/next-best-steps/generate", async (req, reply) => {
    const { child_id } = (req.body as any);
    const created: any[] = [];
    // Suggest deadlines due within next 14 days
    const soon = await (prisma as any).deadlines.findMany({ where: { child_id, due_date: { lte: new Date(Date.now() + 14*86400000) } } });
    for (const d of soon) {
      const row = await (prisma as any).next_best_steps.create({ data: { child_id, kind: "deadline_upcoming", payload_json: { deadline_id: d.id, due_date: d.due_date }, suggested_at: new Date() } });
      created.push(row);
    }
    return reply.send(created);
  });

  app.post<{ Params: { id: string } }>("/next-best-steps/:id/accept", async (req, reply) => {
    const id = (req.params as any).id;
    await (prisma as any).next_best_steps.update({ where: { id }, data: { accepted_at: new Date() } });
    return reply.send({ ok: true });
  });

  app.post<{ Params: { id: string } }>("/next-best-steps/:id/dismiss", async (req, reply) => {
    const id = (req.params as any).id;
    await (prisma as any).next_best_steps.update({ where: { id }, data: { dismissed_at: new Date() } });
    return reply.send({ ok: true });
  });
}

