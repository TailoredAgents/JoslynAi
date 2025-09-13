import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db";
import { SMART_ATTACHMENT_MAP } from "@iep-ally/core/smart_attachments/map";

export default async function routes(app: FastifyInstance) {
  app.post("/tools/smart-attachments/suggest", async (req, reply) => {
    const { child_id, denial_reason, limit = 5 } = (req.body as any);
    const rules = (SMART_ATTACHMENT_MAP as any)[denial_reason] || [];
    if (!rules.length) return reply.send({ suggestions: [] });

    const tags = Array.from(new Set(rules.flatMap((r: any) => r.tags)));
    const docs = await (prisma as any).documents.findMany({
      where: { child_id, doc_tags: { hasSome: tags } },
      orderBy: { created_at: "desc" },
      take: 20,
    });

    const suggestions = (docs as any[]).slice(0, limit).map((d) => ({
      document_id: d.id,
      doc_name: d.original_name || d.type,
      pages: [],
      rationale: (rules.find((r: any) => r.tags.some((t: string) => (d.doc_tags || []).includes(t)))?.rationale) || "Relevant evidence",
    }));

    return reply.send({ suggestions });
  });
}

