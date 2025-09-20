import { FastifyInstance } from "fastify";
import { FALLBACK_ORG_ID, isUuid } from "../lib/child.js";

/**
 * Authentication middleware
 * - Defaults to JWT verification using fastify-jwt
 * - Optional header-based dev mode can be enabled with ALLOW_HEADER_AUTH=1 (not for production)
 */
export default async function auth(app: FastifyInstance) {
  app.addHook("preHandler", async (req, reply) => {
    const allowHeaderAuth = process.env.ALLOW_HEADER_AUTH === "1" && process.env.NODE_ENV !== "production";
    const internalKey = (req.headers["x-internal-key"] as string | undefined) || undefined;
    const internalOk = internalKey && process.env.INTERNAL_API_KEY && internalKey === process.env.INTERNAL_API_KEY;

    if (internalOk) {
      // Allow trusted internal callers (Web/Worker) to set identity via headers
      const uid = (req.headers["x-user-id"] as string) || "internal";
      const email = (req.headers["x-user-email"] as string) || "internal@system";
      const rawOrg = ((req.headers["x-org-id"] as string) || "").trim();
      const org = isUuid(rawOrg) ? rawOrg : undefined;
      const role = (req.headers["x-user-role"] as string) || "system";
      (req as any).user = { id: uid, email, org_id: org, role };
      return;
    }

    if (allowHeaderAuth) {
      // Explicit, opt-in development-only path
      const uid = (req.headers["x-user-id"] as string) || "demo-user";
      const email = (req.headers["x-user-email"] as string) || "demo@example.com";
      const rawOrg = ((req.headers["x-org-id"] as string) || "").trim();
      const org = isUuid(rawOrg) ? rawOrg : FALLBACK_ORG_ID;
      const role = (req.headers["x-user-role"] as string) || "owner";
      (req as any).user = { id: uid, email, org_id: org, role };
      return;
    }

    // Require a valid JWT in Authorization header
    try {
      await (req as any).jwtVerify();
      const payload: any = (req as any).user || {};
      // Normalize to expected shape
      const id = String(payload.sub || payload.id || "").trim();
      const email = String(payload.email || "").trim() || undefined;
      const role = (payload.role && String(payload.role)) || undefined;
      const org_id = (payload.org_id && isUuid(String(payload.org_id))) ? String(payload.org_id) : undefined;

      if (!id) {
        return reply.code(401).send({ error: "unauthenticated" });
      }
      (req as any).user = { id, email, role, org_id };
    } catch (err) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
  });
}
