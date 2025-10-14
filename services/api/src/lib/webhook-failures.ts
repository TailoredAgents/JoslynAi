import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { recordWebhookMetric } from "./webhook-metrics.js";

type FailureInput = {
  eventId: string;
  eventType: string;
  orgId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  payload?: unknown;
};

export async function recordWebhookFailure(input: FailureInput): Promise<void> {
  const { eventId, eventType, orgId, errorCode, errorMessage, payload } = input;
  if (!eventId || !eventType) return;
  recordWebhookMetric(eventType, "failure");
  const id = crypto.randomUUID();
  await prisma.webhook_failures.upsert({
    where: { event_id: eventId },
    update: {
      event_type: eventType,
      org_id: orgId || null,
      error_code: errorCode || null,
      error_message: errorMessage || null,
      payload_json: payload === undefined ? Prisma.JsonNull : (payload as Prisma.InputJsonValue),
      retry_after: null,
      resolved_at: null,
    },
    create: {
      id,
      event_id: eventId,
      event_type: eventType,
      org_id: orgId || null,
      error_code: errorCode || null,
      error_message: errorMessage || null,
      payload_json: payload === undefined ? Prisma.JsonNull : (payload as Prisma.InputJsonValue),
    },
  });
}

export async function recordWebhookSuccess(eventId: string, eventType: string, orgId?: string | null): Promise<void> {
  if (!eventId || !eventType) return;
  recordWebhookMetric(eventType, "success");
  await prisma.webhook_failures.updateMany({
    where: { event_id: eventId },
    data: { resolved_at: new Date(), error_code: null, error_message: null },
  });
  if (orgId) {
    await prisma.webhook_failures.updateMany({
      where: { org_id: orgId, resolved_at: null, event_id: { not: eventId } },
      data: { retry_after: new Date() },
    });
  }
}

export function recordWebhookSkip(eventType: string): void {
  recordWebhookMetric(eventType, "skipped");
}
