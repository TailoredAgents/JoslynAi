#!/usr/bin/env node
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { getFeaturesForPlan } from "../services/api/src/lib/entitlements.js";

const prisma = new PrismaClient();

function resolveOrgId(payload) {
  if (!payload) return null;
  return payload?.metadata?.org_id || payload?.client_reference_id || null;
}

function resolvePlan(payload, eventType) {
  let plan = String(payload?.items?.data?.[0]?.price?.nickname || payload?.metadata?.plan || "basic").toLowerCase();
  if (plan === "starter") plan = "basic";
  if (eventType === "customer.subscription.deleted") {
    plan = "free";
  }
  return plan;
}

async function reconcileFailure(failure) {
  const { event_id: eventId, event_type: eventType, payload_json: payload } = failure;
  const orgId = resolveOrgId(payload);
  if (!orgId) {
    console.warn(`[skip] ${eventId}: missing org_id`);
    return;
  }
  const plan = resolvePlan(payload, eventType);
  const features = getFeaturesForPlan(plan);
  await prisma.entitlements.upsert({
    where: { org_id: orgId },
    update: { plan, features_json: features },
    create: { org_id: orgId, plan, features_json: features },
  });
  await prisma.webhook_failures.update({
    where: { event_id: eventId },
    data: { resolved_at: new Date(), error_code: null, error_message: null },
  });
  console.log(`[resolved] ${eventId} org=${orgId} plan=${plan}`);
}

async function main() {
  const limit = Number(process.argv[2] || process.env.WEBHOOK_REPLAY_LIMIT || 20);
  const failures = await prisma.webhook_failures.findMany({
    where: { resolved_at: null },
    orderBy: { created_at: "asc" },
    take: limit,
  });
  if (!failures.length) {
    console.log("No unresolved webhook failures found");
    return;
  }
  for (const failure of failures) {
    try {
      await reconcileFailure(failure);
    } catch (err) {
      console.error(`[error] ${failure.event_id}:`, err);
      await prisma.webhook_failures.update({
        where: { event_id: failure.event_id },
        data: { error_code: "reconcile_error", error_message: err instanceof Error ? err.message : String(err) },
      });
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
