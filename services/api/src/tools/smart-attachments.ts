import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { SMART_ATTACHMENT_MAP } from "@joslyn-ai/core/smart_attachments/map";
import { retrieveForAsk } from "@joslyn-ai/core/rag/retriever";
import { OpenAI } from "openai";

export default async function routes(app: FastifyInstance) {
  app.post("/tools/smart-attachments/suggest", async (req, reply) => {
    const { requireEntitlement } = await import("../mw/entitlements.js");
    await requireEntitlement(req, reply, "smart_attachments");
    const { child_id, denial_reason, limit = 5 } = (req.body as any);
    const orgId = (req as any).orgId || (req as any).headers?.['x-org-id'] || (req as any).user?.org_id;
    const rules = (SMART_ATTACHMENT_MAP as any)[denial_reason] || [];
    if (!rules.length) return reply.send({ suggestions: [] });

    const tags = Array.from(new Set(rules.flatMap((r: any) => r.tags))) as string[];
    if (!tags.length) {
      return reply.send({ suggestions: [] });
    }

    const tagFilters = tags.map((tag: string) => ({ doc_tags: { array_contains: tag } }));
    const docWhere: any = { org_id: orgId };
    if (child_id) {
      docWhere.child_id = child_id;
    }
    if (tagFilters.length) {
      docWhere.OR = tagFilters;
    }

    const docs = await (prisma as any).documents.findMany({
      where: docWhere,
      orderBy: { created_at: "desc" },
      take: 20,
    });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const suggestions: any[] = [];
    for (const d of (docs as any[])) {
      const rule = rules.find((r: any) => r.tags.some((t: string) => (d.doc_tags || []).includes(t)));
      const query = rule?.query || "supporting evidence";
      const spans = await retrieveForAsk(prisma as any, openai as any, d.child_id, query, 8, d.id);
      const pages = Array.from(new Set((spans as any[]).map((s: any) => s.page))).slice(0, 4);
      suggestions.push({
        document_id: d.id,
        doc_name: d.original_name || d.type,
        pages,
        rationale: rule?.rationale || "Relevant evidence",
      });
      if (suggestions.length >= limit) break;
    }

    return reply.send({ suggestions });
  });
}

