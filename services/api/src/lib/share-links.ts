import { prisma } from "./db.js";

export type ShareLinkRecord = {
  id: string;
  org_id: string | null;
  resource_type: string;
  resource_subtype: string | null;
  resource_id: string;
  token: string;
  password_hash: string | null;
  meta_json: any;
  expires_at: Date | null;
  created_at: Date;
};

export async function fetchShareLinkByToken(token: string): Promise<ShareLinkRecord | null> {
  if (!token) return null;
  const rows = (await prisma.$queryRawUnsafe(
    "SELECT id, org_id, resource_type, resource_subtype, resource_id, token, password_hash, meta_json, expires_at, created_at FROM joslyn_fetch_share_link($1)",
    token
  )) as any[];
  const row = rows?.[0];
  if (!row) return null;
  return {
    ...row,
    meta_json: row.meta_json ?? {},
    expires_at: row.expires_at ? new Date(row.expires_at) : null,
    created_at: row.created_at ? new Date(row.created_at) : new Date(0),
  } as ShareLinkRecord;
}
