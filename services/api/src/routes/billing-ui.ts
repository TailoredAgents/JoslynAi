import { FastifyInstance } from "fastify";

export default async function routes(app: FastifyInstance) {
  app.get("/billing", async (_req, reply) => {
    const html = `<!doctype html><html><body><h1>Billing</h1>
      <form method="post" action="/billing/checkout">
        <input type="hidden" name="org_id" value="demo-org"/>
        <input type="hidden" name="price_id" value="${process.env.PRICE_PRO || ''}"/>
        <input type="hidden" name="success_url" value="/"/>
        <input type="hidden" name="cancel_url" value="/"/>
        <button type="submit">Upgrade to Pro</button>
      </form>
    </body></html>`;
    reply.type('text/html');
    return reply.send(html);
  });
}

