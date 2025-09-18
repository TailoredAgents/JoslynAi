import { FastifyInstance } from "fastify";
import { createAgentRunner } from "@joslyn-ai/core/agent/orchestrator";
import { createToolsAdapter } from "../lib/tools-adapter.js";
import { orgIdFromRequest } from "../lib/child.js";
import { prisma } from "../lib/db.js";

export default async function routes(app: FastifyInstance) {
  app.post("/agent/run", async (req, reply) => {
    const { intent, input } = req.body as any;
    const user = (req as any).user || {};
    const orgId = orgIdFromRequest(req as any);
    const userId = (user.id as string) || "demo-user";
    const userEmail = (user.email as string) || "demo@example.com";
    const userRole = (user.role as string) || "owner";

    const runAgent = createAgentRunner(
      createToolsAdapter({
        orgId,
        userId,
        userEmail,
        userRole,
      })
    );

    try {
      const out = await runAgent(intent, input, orgId, userId);
      await (prisma as any).agent_runs?.create?.({
        data: {
          org_id: orgId,
          user_id: userId,
          child_id: input?.child_id ?? null,
          intent,
          inputs_json: input,
          outputs_json: out,
          tokens: 0,
          cost_cents: 0,
        },
      }).catch(() => {});
      return reply.send(out);
    } catch (err: any) {
      await (prisma as any).agent_runs?.create?.({
        data: {
          org_id: orgId,
          user_id: userId,
          child_id: input?.child_id ?? null,
          intent,
          inputs_json: input,
          outputs_json: { error: err?.message },
          tokens: 0,
          cost_cents: 0,
        },
      }).catch(() => {});
      return reply.code(500).send({ error: "agent_failed" });
    }
  });
}

