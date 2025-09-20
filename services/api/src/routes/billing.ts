import { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { prisma } from "../lib/db.js";

export default async function routes(app: FastifyInstance) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    app.log.warn("STRIPE_SECRET_KEY not set; billing routes will be no-op");
  }
  const stripe = key ? new Stripe(key, { apiVersion: "2023-10-16" as any }) : (null as any);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // Feature matrices per plan (nickname on Stripe Price)
  // Plans we support: basic ($9), pro ($29)
  const FEATURES_BY_PLAN: Record<string, any> = {
    free: { ask: true, brief: true, letters: { render: false, send: false }, smart_attachments: false, chat: false },
    basic: { ask: true, brief: true, letters: { render: true, send: false }, smart_attachments: false, chat: true },
    pro: { ask: true, brief: true, letters: { render: true, send: true }, smart_attachments: true, chat: true },
    // Legacy plans map to closest current offering
    business: { ask: true, brief: true, letters: { render: true, send: true }, smart_attachments: true, chat: true },
    starter: { ask: true, brief: true, letters: { render: true, send: false }, smart_attachments: false, chat: true },
  };

  // Whitelisted price IDs by plan from env; prevents client from selecting arbitrary prices
  const PRICE_ENV_BY_PLAN: Record<string, string | undefined> = {
    basic: (process.env.PRICE_BASIC || "").trim() || undefined,
    pro: (process.env.PRICE_PRO || "").trim() || undefined,
  };

  app.post("/billing/checkout", async (req, reply) => {
    if (!stripe) return reply.status(501).send({ error: "billing_disabled" });
    const { org_id, price_id, plan, success_url, cancel_url } = (req.body as any);
    if (!org_id) return reply.code(400).send({ error: "missing_org_id" });

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
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url,
      cancel_url,
      metadata: { org_id, plan: planKey || undefined },
      subscription_data: trialDays > 0 ? { trial_period_days: trialDays, metadata: { org_id } } : { metadata: { org_id } },
    });
    return reply.send({ url: session.url });
  });

  app.post("/billing/portal", async (req, reply) => {
    if (!stripe) return reply.status(501).send({ error: "billing_disabled" });
    const { customer_id, return_url } = (req.body as any);
    const portal = await stripe.billingPortal.sessions.create({ customer: customer_id, return_url });
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

    try {
      if (
        event.type === "customer.subscription.updated" ||
        event.type === "checkout.session.completed" ||
        event.type === "customer.subscription.deleted"
      ) {
        const obj: any = event.data?.object || {};
        const meta: any = obj.metadata || {};
        const org_id = meta.org_id || obj.client_reference_id;
        if (!org_id) {
          app.log.warn({ eventId: event.id }, "stripe webhook missing org_id");
        } else {
          let plan = String(obj.items?.data?.[0]?.price?.nickname || "basic").toLowerCase();
          // Normalize common aliases
          if (plan === "starter") plan = "basic";
          if (event.type === "customer.subscription.deleted") {
            plan = "free";
          }
          const features = FEATURES_BY_PLAN[plan] || FEATURES_BY_PLAN["starter"];
          await (prisma as any).entitlements.upsert({
            where: { org_id },
            update: { plan, features_json: features },
            create: { org_id, plan, features_json: features },
          });
        }
      }
    } catch (e) {
      app.log.error({ e, eventId: event.id }, "stripe webhook processing error");
      return reply.code(500).send({ error: "webhook_processing_failed" });
    }

    return reply.send({ received: true });
  });
}
