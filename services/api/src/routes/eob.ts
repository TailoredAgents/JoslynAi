import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { OpenAI } from "openai";
import { safeResponsesCreate } from "../lib/openai.js";

export default async function routes(app: FastifyInstance) {
  app.get<{ Params: { claimId: string } }>("/claims/:claimId/explain", async (req, reply) => {
    const claim = await (prisma as any).claims.findUnique({ where: { id: (req.params as any).claimId } }).catch(() => null);
    if (!claim) return reply.status(404).send({ error: "not found" });
    const eob = await (prisma as any).eobs.findFirst({ where: { claim_id: (req.params as any).claimId } });
    const amounts = (claim as any).amounts_json || {};
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const text = JSON.stringify({ amounts, denial_reason: eob?.parsed_json?.denial_reason });

    const resp = await safeResponsesCreate({
      model: process.env.OPENAI_MODEL_MINI || "gpt-5-mini",
      input: [
        { role: "system", content: "Explain this EOB in plain, parent-friendly English." },
        { role: "user", content: text }
      ]
    } as any);
    const out = (resp as any)?.output?.[0]?.content?.[0]?.text || "Explanation unavailable.";
    return reply.send({ explanation: out, amounts, denial_reason: eob?.parsed_json?.denial_reason || null });
  });
}

