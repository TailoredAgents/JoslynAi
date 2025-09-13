import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db";

export default async function routes(app: FastifyInstance) {
  app.get<{ Params: { id: string }, Querystring: { page?: string } }>("/documents/:id/spans", async (req, reply) => {
    const page = Number((req.query as any)?.page || 0) || undefined;
    const rows = await (prisma as any).doc_spans.findMany({ where: { document_id: (req.params as any).id, ...(page ? { page } : {}) }, select: { page: true, bbox: true, page_width: true, page_height: true, text: true }, take: 200 });
    return reply.send(rows);
  });
}

