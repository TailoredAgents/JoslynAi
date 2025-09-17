import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
export const prisma = new PrismaClient();

// Helper: set org_id session GUC for the current connection within a transaction
export async function withOrgTx<T>(orgId: string | null | undefined, fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const org = orgId || null;
    try {
      // Set Postgres GUC used by RLS policies; null means dev-permissive policy will apply
      await (tx as any).$executeRawUnsafe(`SELECT set_config('request.jwt.org_id', $1, true)`, org);
    } catch {}
    return fn(tx as unknown as PrismaClient);
  });
}

