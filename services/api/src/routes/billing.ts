import { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { prisma } from "../lib/db";

export default async function routes(app: FastifyInstance) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    app.log.warn("STRIPE_SECRET_KEY not set; billing routes will be no-op");
  }
  const stripe = key ? new Stripe(key, { apiVersion: "2023-10-16" as any }) : (null as any);

  app.post("/billing/checkout", async (req, reply) => {
    if (!stripe) return reply.status(501).send({ error: "billing_disabled" });
    const { org_id, price_id, success_url, cancel_url } = (req.body as any);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: price_id, quantity: 1 }],
      success_url, cancel_url,
      metadata: { org_id }
    });
    return reply.send({ url: session.url });
  });

  app.post("/billing/portal", async (req, reply) => {
    if (!stripe) return reply.status(501).send({ error: "billing_disabled" });
    const { customer_id, return_url } = (req.body as any);
    const portal = await stripe.billingPortal.sessions.create({ customer: customer_id, return_url });
    return reply.send({ url: portal.url });
  });

  app.post("/webhooks/stripe", async (req, reply) => {
    const event: any = (req as any).body;
    try {
      if (event?.type === "customer.subscription.updated" || event?.type === "checkout.session.completed") {
        const obj: any = event.data?.object || {};
        const meta: any = obj.metadata || {};
        const org_id = meta.org_id || obj.client_reference_id || "demo-org";
        const plan = obj.items?.data?.[0]?.price?.nickname || "pro";
        const features = plan === "pro" ? { ask:true, brief:true, letters:true, smart_attachments:true } : { ask:true, brief:true, letters:false, smart_attachments:false };
        await (prisma as any).entitlements.upsert({ where: { org_id }, update: { plan, features_json: features }, create: { org_id, plan, features_json: features } });
      }
    } catch (e) {
      app.log.error({ e }, "stripe webhook error");
    }
    return reply.send({ received: true });
  });
}

