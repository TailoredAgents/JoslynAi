import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db";
import { OpenAI } from "openai";

export default async function routes(app: FastifyInstance) {
  app.get<{ Params: { claimId: string } }>("/claims/:claimId/explain", async (req, reply) => {
    const claim = await (prisma as any).claims.findUnique({ where: { id: (req.params as any).claimId }, include: { eobs: true } }).catch(() => null);
    if (!claim) return reply.status(404).send({ error: "not found" });

    const amounts = (claim as any).amounts_json || {};
    const eobs = (claim as any).eobs || [];
    const eob = eobs[0];
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const text = JSON.stringify({ amounts, denial_reason: eob?.parsed_json?.denial_reason });

    const resp = await (openai as any).responses.create({
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

