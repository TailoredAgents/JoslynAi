import { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { prisma } from "../lib/db.js";
import { FEATURES_BY_PLAN, getFeaturesForPlan } from "../lib/entitlements.js";
import { recordWebhookFailure, recordWebhookSuccess, recordWebhookSkip } from "../lib/webhook-failures.js";

export default async function routes(app: FastifyInstance) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    app.log.warn("STRIPE_SECRET_KEY not set; billing routes will be no-op");
  }
  const stripe = key ? new Stripe(key, { apiVersion: "2023-10-16" as any }) : (null as any);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  const configuredBase = (process.env.PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || "").trim();
  let allowOrigin: string | null = null;
  let defaultOrigin = "http://localhost:3000";
  try {
    if (configuredBase) {
      allowOrigin = new URL(configuredBase).origin;
      defaultOrigin = allowOrigin;
    }
  } catch {
    app.log.warn({ configuredBase }, "invalid PUBLIC_BASE_URL; falling back to localhost");
  }
  if (!allowOrigin && process.env.NODE_ENV === "production") {
    throw new Error("PUBLIC_BASE_URL must be configured for billing routes in production");
  }

  const buildAbsolute = (path: string) => {
    const normalized = path && path.startsWith("/") ? path : `/${path || ""}`;
    return new URL(normalized, allowOrigin || defaultOrigin).toString();
  };

  const pickUrl = (candidate: string | undefined, fallbackPath: string) => {
    const fallback = buildAbsolute(fallbackPath);
    if (!candidate) return fallback;
    try {
      const url = new URL(candidate);
      const allowedOrigin = allowOrigin || defaultOrigin;
      if (url.origin === allowedOrigin) return url.toString();
    } catch {}
    return fallback;
  };

  // Whitelisted price IDs by plan from env; prevents client from selecting arbitrary prices
  const PRICE_ENV_BY_PLAN: Record<string, string | undefined> = {
    basic: (process.env.PRICE_BASIC || "").trim() || undefined,
    pro: (process.env.PRICE_PRO || "").trim() || undefined,
  };

  app.post("/billing/checkout", async (req, reply) => {
    if (!stripe) return reply.status(501).send({ error: "billing_disabled" });
    const { price_id, plan, success_url, cancel_url } = (req.body as any);
    const org_id = (req as any).orgId || (req as any).user?.org_id || null;
    if (!org_id) return reply.code(401).send({ error: "org_context_unresolved" });
    // Require owner/admin to initiate checkout
    // @ts-ignore
    if (typeof (req as any).requireRole === 'function') {
      await (req as any).requireRole(org_id, ["owner", "admin"]);
    }

    const planKey = String(plan || "").toLowerCase();
    let priceId: string | undefined = PRICE_ENV_BY_PLAN[planKey];
    const allowed = new Set(Object.values(PRICE_ENV_BY_PLAN).filter(Boolean) as string[]);
    if (!priceId && typeof price_id === "string" && price_id.trim()) {
      const trimmed = price_id.trim();
      if (allowed.has(trimmed)) priceId = trimmed;
    }
    if (!priceId) priceId = PRICE_ENV_BY_PLAN.basic;
    if (!priceId) return reply.code(400).send({ error: "price_not_configured" });

    const trialDays = Number(process.env.STRIPE_TRIAL_DAYS || "0");
    // Build/validate return URLs to prevent open redirects
    const successUrl = pickUrl(success_url, "/billing/success");
    const cancelUrl = pickUrl(cancel_url, "/billing/cancel");

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { org_id, plan: planKey || undefined },
      subscription_data: trialDays > 0 ? { trial_period_days: trialDays, metadata: { org_id } } : { metadata: { org_id } },
    });
    return reply.send({ url: session.url });
  });

  app.post("/billing/portal", async (req, reply) => {
    if (!stripe) return reply.status(501).send({ error: "billing_disabled" });
    const { customer_id, return_url } = (req.body as any);
    const org_id = (req as any).orgId || (req as any).user?.org_id || null;
    if (!org_id) return reply.code(401).send({ error: "org_context_unresolved" });
    // Require owner/admin to open portal
    // @ts-ignore
    if (typeof (req as any).requireRole === 'function') {
      await (req as any).requireRole(org_id, ["owner", "admin"]);
    }
    if (!customer_id) return reply.code(400).send({ error: "customer_id_required" });

    const verifiedReturn = pickUrl(return_url, "/billing");

    try {
      const subs = await stripe.subscriptions.list({ customer: customer_id, limit: 1 });
      const sub = subs.data[0];
      const subOrg = sub?.metadata?.org_id || sub?.items?.data?.[0]?.metadata?.org_id;
      if (!sub || (subOrg && subOrg !== org_id)) {
        return reply.code(403).send({ error: "customer_mismatch" });
      }
    } catch (err) {
      app.log.warn({ err, customer_id, org_id }, "stripe_customer_verification_failed");
      return reply.code(400).send({ error: "customer_verification_failed" });
    }

    const portal = await stripe.billingPortal.sessions.create({ customer: customer_id, return_url: verifiedReturn });
    return reply.send({ url: portal.url });
  });

  app.post("/webhooks/stripe", { config: { rawBody: true } }, async (req, reply) => {
    if (!stripe || !webhookSecret) {
      return reply.status(501).send({ error: "billing_disabled" });
    }

    const signatureHeader = req.headers["stripe-signature"];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    if (!signature) {
      return reply.code(400).send({ error: "missing_signature" });
    }

    let event: Stripe.Event;
    try {
      const rawBody = (req as any).rawBody;
      if (!rawBody) {
        throw new Error("missing_raw_body");
      }
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      app.log.warn({ err }, "stripe webhook signature verification failed");
      return reply.code(400).send({ error: "invalid_signature" });
    }

    const eventType = event.type || "unknown";
    let handled = false;
    try {
      if (
        event.type === "customer.subscription.updated" ||
        event.type === "checkout.session.completed" ||
        event.type === "customer.subscription.deleted"
      ) {
        handled = true;
        const obj: any = event.data?.object || {};
        const meta: any = obj.metadata || {};
        const org_id = meta.org_id || obj.client_reference_id;
        if (!org_id) {
          app.log.warn({ eventId: event.id, eventType }, "stripe webhook missing org_id");
          await recordWebhookFailure({
            eventId: event.id,
            eventType,
            orgId: null,
            errorCode: "org_missing",
            errorMessage: "Webhook payload missing org_id",
            payload: obj,
          });
        } else {
          let plan = String(obj.items?.data?.[0]?.price?.nickname || "basic").toLowerCase();
          // Normalize common aliases
          if (plan === "starter") plan = "basic";
          if (event.type === "customer.subscription.deleted") {
            plan = "free";
          }
          const features = getFeaturesForPlan(plan);
          await (prisma as any).entitlements.upsert({
            where: { org_id },
            update: { plan, features_json: features },
            create: { org_id, plan, features_json: features },
          });
          await recordWebhookSuccess(event.id, eventType, org_id);
          app.log.info({ eventId: event.id, eventType, orgId: org_id, plan }, "stripe webhook processed");
        }
      }
    } catch (e) {
      app.log.error({ e, eventId: event.id, eventType }, "stripe webhook processing error");
      await recordWebhookFailure({
        eventId: event.id,
        eventType,
        orgId: (event.data?.object as any)?.metadata?.org_id,
        errorCode: "processing_error",
        errorMessage: e instanceof Error ? e.message : String(e),
        payload: event.data?.object,
      });
      return reply.code(500).send({ error: "webhook_processing_failed" });
    }

    if (!handled) {
      recordWebhookSkip(eventType);
      app.log.debug({ eventId: event.id, eventType }, "stripe webhook ignored");
    }

    return reply.send({ received: true });
  });
}
