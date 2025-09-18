import { prisma } from "../lib/db.js";

export async function requireEntitlement(req: any, reply: any, feature: string): Promise<boolean> {
  const orgId = (req.orgId || req.headers["x-org-id"] || "demo-org") as string;
  try {
    const ent = await (prisma as any).entitlements.findUnique({ where: { org_id: orgId } });
    const features = ent?.features_json || {};
    const allowed = feature.split('.')
      .reduce((acc: any, key: string) => (acc ? acc[key] : undefined), features);
    if (allowed === false) {
      if (!reply.sent) {
        reply.code(402).send({ upgrade: true });
      }
      return false;
    }
  } catch {}
  return true;
}


