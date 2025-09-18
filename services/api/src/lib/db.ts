import { PrismaClient, Prisma } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";

const basePrisma = new PrismaClient();
const DEFAULT_ORG_ID = (process.env.DEMO_ORG_ID && process.env.DEMO_ORG_ID.trim()) || "00000000-0000-4000-8000-000000000000";
const orgStore = new AsyncLocalStorage<string | null>();

async function applyOrgGuc(client: Prisma.TransactionClient, orgId: string | null) {
  const trimmed = typeof orgId === "string" ? orgId.trim() : "";
  const value = trimmed || DEFAULT_ORG_ID;
  try {
    await (client as any).$executeRawUnsafe(`SELECT set_config('request.jwt.org_id', $1, true)`, value);
  } catch {}
}

function wrapTransactionModel(modelName: string, delegate: any) {
  return new Proxy(delegate, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol") {
        return Reflect.get(target, prop, receiver);
      }
      const value = (target as any)[prop];
      if (typeof value !== "function") {
        return value;
      }
      return value.bind(target);
    },
  });
}

function wrapTransactionClient(tx: Prisma.TransactionClient) {
  const modelCache = new Map<PropertyKey, any>();
  return new Proxy(tx, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        return value.bind(target);
      }
      if (value && typeof value === "object") {
        if (!modelCache.has(prop)) {
          modelCache.set(prop, wrapTransactionModel(String(prop), value));
        }
        return modelCache.get(prop);
      }
      return value;
    },
  });
}

async function executeWithOrg<T>(orgId: string | null, run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return basePrisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await applyOrgGuc(tx, orgId);
    return run(tx);
  });
}

function wrapModel(modelName: string, delegate: any) {
  return new Proxy(delegate, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol") {
        return Reflect.get(target, prop, receiver);
      }
      const value = (target as any)[prop];
      if (typeof value !== "function") {
        return value;
      }
      return (...args: any[]) => {
        const orgId = orgStore.getStore();
        if (!orgId) {
          return value.apply(target, args);
        }
        return executeWithOrg(orgId, async (tx: Prisma.TransactionClient) => {
          const scopedDelegate = (tx as any)[modelName];
          const method = scopedDelegate[prop].bind(scopedDelegate);
          return method(...args);
        });
      };
    },
  });
}

const passthroughRootFns = new Set<PropertyKey>(["$connect", "$disconnect", "$on", "$use", "$extends"]);

const modelCache = new Map<PropertyKey, any>();

export const prisma = new Proxy(basePrisma, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === "function") {
      if (prop === "$transaction") {
        return (arg: any, ...rest: any[]) => {
          if (typeof arg !== "function") {
            return value.call(target, arg, ...rest);
          }
          const orgId = orgStore.getStore() ?? null;
          return basePrisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await applyOrgGuc(tx, orgId);
            const wrappedTx = wrapTransactionClient(tx);
            return orgStore.run(orgId, () => arg(wrappedTx));
          }, ...rest);
        };
      }
      if (passthroughRootFns.has(prop)) {
        return value.bind(target);
      }
      return (...args: any[]) => {
        const orgId = orgStore.getStore();
        if (!orgId) {
          return value.apply(target, args);
        }
        return executeWithOrg(orgId, async (tx: Prisma.TransactionClient) => {
          const method = (tx as any)[prop].bind(tx);
          return method(...args);
        });
      };
    }
    if (value && typeof value === "object") {
      if (!modelCache.has(prop)) {
        modelCache.set(prop, wrapModel(String(prop), value));
      }
      return modelCache.get(prop);
    }
    return value;
  },
}) as PrismaClient;

export function setOrgContext(orgId: string | null | undefined) {
  orgStore.enterWith(orgId ?? null);
}

export function runWithOrgContext<T>(orgId: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  return orgStore.run(orgId ?? null, fn);
}

export function getOrgContext(): string | null {
  return orgStore.getStore() ?? null;
}

export async function withOrgTx<T>(orgId: string | null | undefined, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return executeWithOrg(orgId ?? null, fn);
}


