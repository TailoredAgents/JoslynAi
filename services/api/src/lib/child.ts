import { prisma } from "./db.js";

export function orgIdFromRequest(req: any): string {\n  return (req?.orgId as string) || (req?.headers?.['x-org-id'] as string) || (req?.user?.org_id as string) || 'demo-org';\n}\n\nconst UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  if (!value) return false;
  return UUID_REGEX.test(value);
}

export function slugifyCandidate(input: string | null | undefined): string {
  const base = (input || "child")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "child";
}

async function findChildBySlug(slug: string, orgId?: string | null) {
  const where: any = { slug };
  if (orgId) where.org_id = orgId;
  return (prisma as any).children.findFirst({ where, select: { id: true, slug: true, name: true } });
}

async function slugExists(slug: string, orgId?: string | null) {
  const child = await findChildBySlug(slug, orgId);
  return Boolean(child);
}

export async function ensureUniqueSlug(candidate: string, orgId?: string | null) {
  const base = slugifyCandidate(candidate);
  let slug = base;
  let attempt = 1;
  while (await slugExists(slug, orgId)) {
    const suffix = `-${(++attempt).toString(36)}`;
    const prefix = base.slice(0, Math.max(1, 60 - suffix.length));
    slug = `${prefix}${suffix}`;
  }
  return slug;
}

export async function resolveChildId(identifier: string | null | undefined, orgId?: string | null) {
  if (!identifier) return null;
  if (isUuid(identifier)) {
    // Enforce that UUID belongs to the current org when orgId is provided
    const found = await (prisma as any).children.findFirst({ where: { id: identifier, ...(orgId ? { org_id: orgId } : {}) }, select: { id: true } });
    return found?.id || null;
  }
  const child = await findChildBySlug(identifier, orgId);
  return child?.id || null;
}

export async function ensureChildRecord({
  identifier,
  fallbackName,
  orgId,
}: {
  identifier?: string | null;
  fallbackName?: string;
  orgId?: string | null;
}) {
  const scopedOrgId = orgId || "demo-org";
  if (identifier) {
    const found = await (prisma as any).children.findFirst({
      where: isUuid(identifier)
        ? { id: identifier }
        : { slug: identifier, org_id: scopedOrgId },
      select: { id: true, slug: true, name: true },
    });
    if (found) return found;
  }
  const existing = await (prisma as any).children.findFirst({
    where: { org_id: scopedOrgId },
    orderBy: { created_at: "asc" },
    select: { id: true, slug: true, name: true },
  });
  if (existing) return existing;
  const slugSeed = identifier || fallbackName || scopedOrgId || "demo-child";
  const baseSlug = await ensureUniqueSlug(slugSeed, scopedOrgId);
  return (prisma as any).children.create({
    data: {
      name: fallbackName || "Demo Child",
      org_id: scopedOrgId,
      slug: baseSlug,
    },
    select: { id: true, slug: true, name: true },
  });
}


