import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { enqueue } from "../lib/redis.js";
import { orgIdFromRequest, resolveChildId } from "../lib/child.js";
import QRCode from "qrcode";
import crypto from "node:crypto";

function serializeOnePager(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    audience: row.audience,
    child_id: row.child_id,
    language_primary: row.language_primary,
    language_secondary: row.language_secondary,
    share_link_id: row.share_link_id,
    content: row.content_json || {},
    citations: Array.isArray(row.citations_json) ? row.citations_json : [],
    updated_at: row.updated_at,
  };
}

async function findDefaultDocument(childId: string) {
  const evalDoc = await (prisma as any).documents.findFirst({
    where: { child_id: childId, type: "eval_report" },
    orderBy: [{ created_at: "desc" }],
    select: { id: true },
  });
  if (evalDoc?.id) return evalDoc.id;
  const iepDoc = await (prisma as any).documents.findFirst({
    where: { child_id: childId, type: "iep" },
    orderBy: [{ version: "desc" }, { created_at: "desc" }],
    select: { id: true },
  });
  if (iepDoc?.id) return iepDoc.id;
  const anyDoc = await (prisma as any).documents.findFirst({
    where: { child_id: childId },
    orderBy: [{ created_at: "desc" }],
    select: { id: true },
  });
  return anyDoc?.id || null;
}

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export default async function routes(app: FastifyInstance) {
  app.get<{ Params: { childId: string } }>("/children/:childId/one-pagers", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const childId = await resolveChildId((req.params as any).childId, orgId);
    if (!childId) return reply.status(404).send({ error: "child_not_found" });

    const rows = await (prisma as any).one_pagers.findMany({
      where: { child_id: childId },
      orderBy: { updated_at: "desc" },
    });
    return reply.send({ one_pagers: rows.map((row: any) => serializeOnePager(row)) });
  });

  app.post<{ Params: { childId: string }; Body: { audience?: string; document_id?: string; language_primary?: string; language_secondary?: string } }>("/children/:childId/one-pagers", async (req, reply) => {
    const orgId = orgIdFromRequest(req as any);
    const childId = await resolveChildId((req.params as any).childId, orgId);
    if (!childId) return reply.status(404).send({ error: "child_not_found" });

    const body = (req.body as any) || {};
    const audience = (body.audience || "teacher").toLowerCase();
    const language_primary = (body.language_primary || "en").toLowerCase();
    const language_secondary = body.language_secondary ? String(body.language_secondary).toLowerCase() : "es";
    let documentId = body.document_id || null;
    if (!documentId) {
      documentId = await findDefaultDocument(childId);
    }

    const record = await (prisma as any).one_pagers.create({
      data: {
        child_id: childId,
        org_id: orgId,
        audience,
        language_primary,
        language_secondary,
        content_json: {},
        citations_json: [],
        status: "pending",
      },
    });

    await enqueue({
      kind: "build_one_pager",
      one_pager_id: record.id,
      child_id: childId,
      org_id: orgId,
      audience,
      document_id: documentId,
      language_primary,
      language_secondary,
    });

    return reply.send({ one_pager: serializeOnePager(record) });
  });

  app.post<{ Params: { id: string }; Body: { document_id?: string; language_primary?: string; language_secondary?: string } }>("/one-pagers/:id/regenerate", async (req, reply) => {
    const onePagerId = (req.params as any).id;
    const body = (req.body as any) || {};
    const record = await (prisma as any).one_pagers.findUnique({ where: { id: onePagerId } });
    if (!record) {
      return reply.status(404).send({ error: "one_pager_not_found" });
    }
    const orgId = record.org_id;
    const childId = record.child_id;
    const language_primary = (body.language_primary || record.language_primary || "en").toLowerCase();
    const language_secondary = body.language_secondary ? String(body.language_secondary).toLowerCase() : (record.language_secondary || "es");
    let documentId = body.document_id || null;
    if (!documentId) {
      const content = record.content_json || {};
      documentId = content.document_id || (await findDefaultDocument(childId));
    }

    const updated = await (prisma as any).one_pagers.update({
      where: { id: onePagerId },
      data: {
        status: "pending",
        language_primary,
        language_secondary,
      },
    });

    await enqueue({
      kind: "build_one_pager",
      one_pager_id: onePagerId,
      child_id: childId,
      org_id: orgId,
      audience: updated.audience,
      document_id: documentId,
      language_primary,
      language_secondary,
    });

    return reply.send({ one_pager: serializeOnePager(updated) });
  });

  app.post<{ Params: { id: string }; Body: { password?: string; expires_at?: string } }>("/one-pagers/:id/publish", async (req, reply) => {
    const onePagerId = (req.params as any).id;
    const body = (req.body as any) || {};
    const record = await (prisma as any).one_pagers.findUnique({ where: { id: onePagerId } });
    if (!record) {
      return reply.status(404).send({ error: "one_pager_not_found" });
    }
    if (record.status !== "ready" && record.status !== "empty") {
      return reply.status(400).send({ error: "one_pager_not_ready" });
    }

    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const password_hash = body.password ? hashPassword(body.password) : null;
    const expires_at = body.expires_at ? new Date(body.expires_at) : null;

    const shareLink = await (prisma as any).share_links.create({
      data: {
        org_id: record.org_id,
        resource_type: "one_pager",
        resource_subtype: record.audience,
        resource_id: record.id,
        token,
        password_hash: password_hash || undefined,
        meta_json: {
          child_id: record.child_id,
          language_primary: record.language_primary,
          language_secondary: record.language_secondary,
        },
        expires_at,
      },
    });

    await (prisma as any).one_pagers.update({
      where: { id: record.id },
      data: { share_link_id: shareLink.id },
    });

    const base = process.env.PUBLIC_BASE_URL || "http://localhost:8080";
    const share_url = `${base}/share/${token}`;
    const qr_base64 = await QRCode.toDataURL(share_url);

    return reply.send({
      share_url,
      qr_base64,
      password_required: Boolean(password_hash),
      share_link_id: shareLink.id,
    });
  });
}
