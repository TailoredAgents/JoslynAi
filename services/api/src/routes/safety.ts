import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { orgIdFromRequest, resolveChildId } from "../lib/child.js";
import { enqueue } from "../lib/redis.js";

function serializePhrase(row: any) {
  if (!row) return null;
  const content = row.content_json || {};
  return {
    id: row.id,
    status: row.status,
    org_id: row.org_id,
    tag: row.tag,
    contexts: Array.isArray(row.contexts) ? row.contexts : [],
    phrase_en: content.phrase_en || "",
    phrase_es: content.phrase_es || "",
    rationale: content.rationale || null,
    updated_at: row.updated_at,
  };
}

export default async function routes(app: FastifyInstance) {
  app.get<{ Params: { childId: string }; Querystring: { tag?: string } }>("/children/:childId/safety/phrases", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const childId = await resolveChildId((req.params as any).childId, orgId);
    if (!childId) return reply.status(404).send({ error: "child_not_found" });

    const tag = ((req.query as any)?.tag || "").toLowerCase();
    const rows = await (prisma as any).safety_phrases.findMany({
      where: {
        tag: tag ? tag : undefined,
        status: "active",
        OR: [{ org_id: orgId }, { org_id: null }],
      },
      orderBy: { updated_at: "desc" },
      take: 10,
    });

    return reply.send({ phrases: rows.map((row: any) => serializePhrase(row)) });
  });

  app.post<{ Params: { childId: string }; Body: { tag: string; contexts?: string[] } }>("/children/:childId/safety/phrases", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const childId = await resolveChildId((req.params as any).childId, orgId);
    if (!childId) return reply.status(404).send({ error: "child_not_found" });

    const { tag, contexts } = (req.body as any) || {};
    if (!tag) return reply.status(400).send({ error: "tag_required" });

    await enqueue({
      kind: "generate_safety_phrase",
      child_id: childId,
      org_id: orgId,
      tag: tag.toLowerCase(),
      contexts: Array.isArray(contexts) ? contexts : [],
    });

    return reply.send({ ok: true });
  });

  app.post<{ Body: { phrases: Array<{ tag: string; contexts?: string[]; content: { phrase_en: string; phrase_es?: string; rationale?: string } }> } }>("/admin/safety/phrases/seed", async (req, reply) => {
    const { phrases } = (req.body as any) || {};
    if (!Array.isArray(phrases) || !phrases.length) {
      return reply.status(400).send({ error: "phrases_required" });
    }

    await enqueue({ kind: "seed_safety_phrases", org_id: null, phrases });
    return reply.send({ ok: true });
  });
}
