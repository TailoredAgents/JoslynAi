import { FastifyInstance } from "fastify";

export default async function routes(app: FastifyInstance) {
  app.get("/billing", async (_req, reply) => {
    const html = `<!doctype html><html><body><h1>Billing</h1>
      <p>Test checkout buttons (Stripe Test Mode recommended).</p>
      <div style="display:flex; gap:12px;">
        <form method="post" action="/billing/checkout">
          <input type="hidden" name="org_id" value="demo-org"/>
          <input type="hidden" name="price_id" value="${process.env.PRICE_BASIC || ''}"/>
          <input type="hidden" name="success_url" value="/"/>
          <input type="hidden" name="cancel_url" value="/"/>
          <button type="submit">Basic ($9)</button>
        </form>
        <form method="post" action="/billing/checkout">
          <input type="hidden" name="org_id" value="demo-org"/>
          <input type="hidden" name="price_id" value="${process.env.PRICE_PRO || ''}"/>
          <input type="hidden" name="success_url" value="/"/>
          <input type="hidden" name="cancel_url" value="/"/>
          <button type="submit">Pro ($29)</button>
        </form>
      </div>
    </body></html>`;
    reply.type('text/html');
    return reply.send(html);
  });
}


