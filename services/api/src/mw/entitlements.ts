import { prisma } from "../lib/db.js";
import { FALLBACK_ORG_ID, isUuid } from "../lib/child.js";
import { getFeaturesForPlan, resolveFeatureFlag } from "../lib/entitlements.js";

export async function requireEntitlement(req: any, reply: any, feature: string): Promise<boolean> {
  const claimed = (req as any).orgId || (req as any).user?.org_id || null;
  const orgId = isUuid(String(claimed || "")) ? String(claimed) : FALLBACK_ORG_ID;
  try {
    const ent = await (prisma as any).entitlements.findUnique({ where: { org_id: orgId } });
    if (!ent) {
      if (!reply.sent) {
        reply.code(402).send({ upgrade: true, reason: "missing_entitlement" });
      }
      return false;
    }
    const features = (ent.features_json && typeof ent.features_json === "object")
      ? ent.features_json
      : getFeaturesForPlan(ent.plan);
    const allowed = resolveFeatureFlag(features || {}, feature);
    const permitted = (() => {
      if (allowed === undefined || allowed === null) return false;
      if (typeof allowed === "boolean") return allowed;
      return true;
    })();
    if (!permitted) {
      if (!reply.sent) {
        reply.code(402).send({ upgrade: true, reason: "feature_disabled", feature });
      }
      return false;
    }
  } catch {}
  return true;
}


