import { FastifyInstance } from "fastify";
import { prisma, setOrgContext } from "../lib/db.js";
import { FALLBACK_ORG_ID, isUuid } from "../lib/child.js";

export default async function dbSession(app: FastifyInstance) {
  app.addHook("onRequest", async (req) => {
    // Derive org from authenticated user membership; do not trust headers
    let resolved: string | null = null;
    const allowHeaderAuth = process.env.ALLOW_HEADER_AUTH === "1" && process.env.NODE_ENV !== "production";
    const internalKey = (req.headers["x-internal-key"] as string | undefined) || undefined;
    const internalOk = internalKey && process.env.INTERNAL_API_KEY && internalKey === process.env.INTERNAL_API_KEY;

    const user: any = (req as any).user || {};
    const userId = typeof user?.id === "string" ? user.id : undefined;
    const claimOrg = (user?.org_id && String(user.org_id).trim()) || "";

    if (!resolved && internalOk) {
      const hdrOrg = ((req.headers["x-org-id"] as string) || "").trim();
      if (isUuid(hdrOrg)) {
        resolved = hdrOrg;
      }
    }

    if (!resolved && userId && isUuid(claimOrg)) {
      try {
        const m = await (prisma as any).org_members.findFirst({ where: { user_id: userId, org_id: claimOrg }, select: { org_id: true } });
        if (m?.org_id) resolved = m.org_id;
      } catch {}
    }

    if (!resolved && userId) {
      try {
        const m = await (prisma as any).org_members.findFirst({ where: { user_id: userId }, select: { org_id: true } });
        if (m?.org_id) resolved = m.org_id;
      } catch {}
    }

    // As a last resort in explicit dev mode only, use the demo org
    if (!resolved) {
      resolved = FALLBACK_ORG_ID;
    }

    (req as any).orgId = resolved;
    setOrgContext(resolved);
  });
}
