import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { OpenAI } from "openai";
import { safeResponsesCreate } from "../lib/openai.js";
import { retrieveForAsk } from "@joslyn-ai/core/rag/retriever";
import { orgIdFromRequest, resolveChildId } from "../lib/child.js";

const system = `You explain an IEP in plain, parent-friendly language at grade 7 level.
Use only provided excerpts from the user's document. Always include citations.`;

const BriefSchema = {
  name: "IepBrief",
  strict: true,
  schema: {
    type: "object",
    properties: {
      overview: { type: "string" },
      services: { type: "array", items: { type: "string" } },
      accommodations: { type: "array", items: { type: "string" } },
      goals_summary: { type: "string" },
      citations: {
        type: "array", items: {
          type: "object",
          properties: { document_id:{type:"string"}, doc_name:{type:"string"}, page:{type:"integer"}, quote:{type:"string"} },
          required: ["document_id","doc_name","page","quote"], additionalProperties:false
        }
      }
    },
    required: ["overview","citations"], additionalProperties: false
  }
};

export default async function routes(fastify: FastifyInstance) {
  fastify.get<{ Params: { id: string }, Querystring: { lang?: string, child_id: string } }>(
    "/documents/:id/brief",
    async (req, reply) => {
      const { id } = req.params;
      const { lang = "en", child_id } = req.query;
      const orgId = orgIdFromRequest(req);
      const childId = await resolveChildId(child_id, orgId);
      if (!childId) return reply.status(404).send({ error: "child_not_found" });
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const seeds = ["services", "accommodations", "goals", "placement", "minutes"];
      const spansSets = await Promise.all(seeds.map(seed => retrieveForAsk(prisma as any, openai, childId, seed, 6)));
      const spans = Array.from(new Map((spansSets.flat() as any[]).map((s: any) => [s.id, s])).values()).slice(0, 18);
      if (!spans.length) return reply.send({ overview: "I don't see enough content in your document yet.", citations: [] });

      const blocks = spans.map((s: any, i: number) => `#${i+1} [${s.doc_name} p.${s.page}] ${s.text.slice(0, 700)}`).join("\n---\n");
      const resp = await safeResponsesCreate({
        model: process.env.OPENAI_MODEL_MINI || "gpt-5-mini",
        input: [
          { role: "system", content: system },
          { role: "user", content: `Language: ${lang}\nCreate a brief. Excerpts:\n${blocks}` }
        ],
        response_format: { type: "json_schema", json_schema: BriefSchema }
      } as any);

      const text = (resp as any)?.output?.[0]?.content?.[0]?.text;
      let data: any = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (err) {
          const log = (req as any).log;
          log?.warn?.({ err, preview: String(text).slice(0, 200) }, "brief_json_parse_failed");
        }
      }
      if (!data) return reply.send({ overview: "Brief generation failed. Try again.", citations: [] });
      return reply.send(data);
    }
  );
}

