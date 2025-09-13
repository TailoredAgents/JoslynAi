import { prisma } from "../lib/db";

export async function requireEntitlement(req: any, reply: any, feature: string) {
  const orgId = (req.orgId || req.headers["x-org-id"] || "demo-org") as string;
  try {
    const ent = await (prisma as any).entitlements.findUnique({ where: { org_id: orgId } });
    const f = ent?.features_json || {};
    const ok = feature.split('.').reduce((acc: any, k: string) => (acc ? acc[k] : undefined), f);
    if (ok === false) return reply.code(402).send({ upgrade: true });
  } catch {}
}

