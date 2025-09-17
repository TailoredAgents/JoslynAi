import { FastifyInstance } from "fastify";
import { prisma } from "../../lib/db.js";
import { enqueue } from "../../lib/redis.js";

export default async function routes(app: FastifyInstance) {
  app.addHook("onRequest", async (req, reply) => {
    if ((req.headers["x-internal-key"] as string | undefined) !== process.env.INTERNAL_API_KEY) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.post("/internal/eob/ingest", async (req, reply) => {
    const { child_id, document_id, parsed } = (req.body as any);
    let org_id: string | null = null;
    try {
      const ch = await (prisma as any).children.findUnique({ where: { id: child_id }, select: { org_id: true } });
      org_id = ch?.org_id || null;
    } catch {}
    const existing = await (prisma as any).claims.findFirst({
      where: {
        child_id,
        service_date: parsed?.service_date ? new Date(parsed.service_date) : undefined,
        provider: parsed?.provider || undefined,
      },
    });

    let linked: any[] = [];
    if (existing?.linked_document_ids) {
      try { linked = Array.isArray(existing.linked_document_ids) ? existing.linked_document_ids : []; } catch {}
    }
    if (!linked.includes(document_id)) linked.push(document_id);

    const claim = existing
      ? await (prisma as any).claims.update({
          where: { id: existing.id },
          data: {
            org_id: org_id || existing.org_id || null,
            amounts_json: parsed?.amounts ?? existing.amounts_json,
            status: existing.status ?? "open",
            linked_document_ids: linked,
          },
        })
      : await (prisma as any).claims.create({
          data: {
            child_id,
            org_id,
            service_date: parsed?.service_date ? new Date(parsed.service_date) : null,
            provider: parsed?.provider ?? null,
            amounts_json: parsed?.amounts ?? {},
            status: "open",
            linked_document_ids: [document_id],
          },
        });

    const e = await (prisma as any).eobs.upsert({
      where: { document_id },
      update: { claim_id: claim.id, org_id: org_id || null, parsed_json: parsed },
      create: { claim_id: claim.id, document_id, org_id: org_id || null, parsed_json: parsed, explanation_text: null },
    });

    await enqueue({ kind: "denial_explain", eob_id: e.id, document_id, child_id, org_id });

    return reply.send({ ok: true, claim_id: claim.id, eob_id: e.id });
  });
}


