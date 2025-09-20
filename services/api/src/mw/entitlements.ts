import { prisma } from "../lib/db.js";
import { FALLBACK_ORG_ID, isUuid } from "../lib/child.js";

export async function requireEntitlement(req: any, reply: any, feature: string): Promise<boolean> {
  const claimed = (req as any).orgId || (req as any).user?.org_id || null;
  const orgId = isUuid(String(claimed || "")) ? String(claimed) : FALLBACK_ORG_ID;
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


