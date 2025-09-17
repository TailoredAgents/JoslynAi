import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { MODEL_RATES, computeCostCents } from "../lib/pricing.js";
import { OpenAI } from "openai";
import { safeResponsesCreate } from "../lib/openai.js";
import fs from "node:fs";
import path from "node:path";
import { retrieveForAsk } from "@joslyn-ai/core/rag/retriever";
import { orgIdFromRequest, resolveChildId } from "../lib/child.js";

function readPrompt(rel: string) {
  const p = path.resolve(process.cwd(), rel);
  return fs.readFileSync(p, "utf8");
}


const ANSWER_DISCLAIMER = "This guidance is educational only and not legal or medical advice.";

function withDisclaimer(answer: string): string {
  const trimmed = (answer || "").trim();
  if (!trimmed) {
    return ANSWER_DISCLAIMER;
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes("not legal") && lower.includes("medical advice")) {
    return trimmed;
  }
  return `${trimmed}\n\n${ANSWER_DISCLAIMER}`;
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
    const { requireEntitlement } = await import("../mw/entitlements.js");
    await requireEntitlement(req, reply, "ask");
    const { query, lang = "en" } = req.body;
    const orgId = orgIdFromRequest(req);
    const childIdInput = req.params.id;
    const childId = await resolveChildId(childIdInput, orgId);
    if (!childId) {
      return reply.status(404).send({ error: "child_not_found" });
    }
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const spans = await retrieveForAsk(prisma as any, openai, childId, query, 12);
    if (!spans.length) {
      const fallback = await safeResponsesCreate({
        model: process.env.OPENAI_MODEL_MINI || "gpt-5-mini",
        input: [
          {
            role: "system",
            content: "You are Joslyn AI, an IEP/504 co-pilot. Answer general questions clearly and concisely in parent-friendly language. If the question requires the user's documents, explain that you can't see them. Always remind the user this is not legal or medical advice."
          },
          { role: "user", content: query }
        ]
      } as any);

      const responseText = (fallback as any)?.output?.[0]?.content?.[0]?.text || "I couldn't find that just yet.";
      return reply.send({ answer: withDisclaimer(responseText), citations: [] });
    }

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
    return reply.send({ answer: withDisclaimer(parsed.answer), citations: cit });
  });
}




