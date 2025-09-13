import { FastifyInstance } from "fastify";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { runAgent } from "@iep-ally/core/agent/orchestrator";
import { prisma } from "../lib/db";

export default async function routes(app: FastifyInstance) {
  app.post("/agent/run", async (req, reply) => {
    const { intent, input, org_id = "demo-org", user_id = "demo-user" } = (req.body as any);
    try {
      const out = await runAgent(intent, input, org_id, user_id);
      await (prisma as any).agent_runs?.create?.({
        data: { org_id, user_id, child_id: input?.child_id ?? null, intent, inputs_json: input, outputs_json: out, tokens: 0, cost_cents: 0 },
      }).catch(() => {});
      return reply.send(out);
    } catch (err: any) {
      await (prisma as any).agent_runs?.create?.({
        data: { org_id, user_id, child_id: input?.child_id ?? null, intent, inputs_json: input, outputs_json: { error: err?.message }, tokens: 0, cost_cents: 0 },
      }).catch(() => {});
      return reply.code(500).send({ error: "agent_failed" });
    }
  });
}

