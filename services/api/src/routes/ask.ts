import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db";
import { MODEL_RATES, computeCostCents } from "../lib/pricing";
import { OpenAI } from "openai";
import { safeResponsesCreate } from "../lib/openai";
import fs from "node:fs";
import path from "node:path";
import { retrieveForAsk } from "@iep-ally/core/rag/retriever";

function readPrompt(rel: string) {
  const p = path.resolve(process.cwd(), rel);
  return fs.readFileSync(p, "utf8");
}

const askSystem = readPrompt("packages/core/prompts/ask_bar_system.txt");

const AskAnswerSchema = {
  name: "AskAnswer",
  schema: {
    type: "object",
    properties: {
      answer: { type: "string" },
      citations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            document_id: { type: "string" },
            doc_name: { type: "string" },
            page: { type: "integer" },
            quote: { type: "string" }
          },
          required: ["document_id", "doc_name", "page", "quote"],
          additionalProperties: false
        }
      }
    },
    required: ["answer", "citations"],
    additionalProperties: false
  },
  strict: true,
};

export default async function routes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string }, Body: { query: string, lang?: string } }>("/children/:id/ask", async (req, reply) => {
    const { requireEntitlement } = await import("../mw/entitlements");
    await requireEntitlement(req, reply, "ask");
    const { query, lang = "en" } = req.body;
    const childId = req.params.id;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const spans = await retrieveForAsk(prisma as any, openai, childId, query, 12);
    if (!spans.length) return reply.send({ answer: "I don’t see that in your documents yet.", citations: [] });

    const excerptBlocks = spans.map((s: any, i: number) => `#${i + 1} [${s.doc_name} p.${s.page}] ${s.text.slice(0, 600)}`).join("\n---\n");

    const resp = await safeResponsesCreate({
      model: process.env.OPENAI_MODEL_MINI || "gpt-5-mini",
      input: [
        { role: "system", content: askSystem },
        { role: "user", content: `Language: ${lang}\nQuestion: ${query}\n\nExcerpts (cite specific ones):\n${excerptBlocks}` }
      ],
      response_format: { type: "json_schema", json_schema: AskAnswerSchema } as any
    } as any);

    const text = (resp as any)?.output?.[0]?.content?.[0]?.text;
    const parsed = text ? JSON.parse(text) : null;
    try {
      const u = (resp as any)?.usage || {};
      const model = (resp as any)?.model || (process.env.OPENAI_MODEL_MINI || "gpt-5-mini");
      const cost = computeCostCents({ model, input_tokens: u.input_tokens||0, output_tokens: u.output_tokens||0, cached_tokens: u.cached_tokens||0 }, MODEL_RATES);
      await (prisma as any).agent_runs.create({ data: { org_id: (req as any).orgId || null, user_id: null, child_id: childId, intent: "ask", route: "/children/:id/ask", inputs_json: { query }, outputs_json: parsed||{}, tokens: (u.input_tokens||0)+(u.output_tokens||0), cost_cents: cost } });
    } catch {}
    if (!parsed) return reply.send({ answer: "I don’t see that in your documents yet.", citations: [] });

    const cit = (parsed.citations || []).slice(0, 5);
    return reply.send({ answer: parsed.answer, citations: cit });
  });
}
