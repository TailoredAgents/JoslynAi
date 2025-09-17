import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { signedGetUrl } from "../lib/s3.js";
import { orgIdFromRequest } from "../lib/child.js";
import { orgIdFromRequest } from "../lib/child.js";

export default async function routes(app: FastifyInstance) {
  app.get<{ Params: { id: string }, Querystring: { ttl?: string } }>(
    "/documents/:id/url",
    async (req, reply) => {
      const { id } = req.params as any;
      const orgId = orgIdFromRequest(req as any);
      const ttl = Math.min(Number((req.query as any)?.ttl ?? 900), 3600) || 900;
      const doc = await (prisma as any).documents.findFirst({ where: { id, org_id: orgId }, select: { storage_uri: true } });
      if (!doc?.storage_uri) return reply.status(404).send({ error: "not_found" });
      const url = await signedGetUrl(doc.storage_uri, ttl);
      return reply.send({ url, key: doc.storage_uri, ttl });
    }
  );

  app.get<{ Params: { id: string } }>("/letters/:id/url", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const row = await (prisma as any).letters.findFirst({ where: { id: (req.params as any).id, org_id: orgId }, select: { pdf_uri: true } });
    if (!row?.pdf_uri) return reply.status(404).send({ error: "not_found" });
    const url = await signedGetUrl(row.pdf_uri, 900);
    return reply.send({ url });
  });

  app.get<{ Params: { childId: string } }>("/profiles/:childId/url", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const key = `org/${orgId}/profiles/${(req.params as any).childId}.pdf`;
    const url = await signedGetUrl(key, 900);
    return reply.send({ url });
  });
}


