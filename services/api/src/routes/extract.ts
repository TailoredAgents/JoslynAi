import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { MODEL_RATES, computeCostCents } from "../lib/pricing.js";
import { OpenAI } from "openai";
import { safeResponsesCreate } from "../lib/openai.js";
import fs from "node:fs";
import path from "node:path";
import { orgIdFromRequest } from "../lib/child.js";

function readFile(rel: string) {
  return fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

const iepSystem = readFile("packages/core/prompts/iep_extract_system.txt");
const iepSchema = JSON.parse(readFile("packages/core/schemas/iep.schema.json"));

export default async function routes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string } }>("/documents/:id/extract/iep", async (req, reply) => {
    const documentId = req.params.id;
    const orgId = orgIdFromRequest(req as any);
    const allowed = await (prisma as any).documents.findFirst({ where: { id: documentId, org_id: orgId }, select: { id: true } });
    if (!allowed) return reply.status(404).send({ error: "not_found" });

    const spans = await (prisma as any).doc_spans?.findMany?.({
      where: { document_id: documentId },
      orderBy: { page: "asc" },
      take: 30,
      select: { text: true, page: true }
    }).catch?.(() => null);

    let spansData = spans as any[] | null;
    if (!spansData) {
      spansData = await prisma.$queryRawUnsafe(
        `SELECT page, text FROM doc_spans WHERE document_id = $1 ORDER BY page ASC LIMIT 30`,
        documentId
      ) as any as any[];
    }

    if (!spansData || !spansData.length) return reply.status(400).send({ error: "Document not indexed yet" });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const text = spansData.map((s) => `Page ${s.page}:\n${s.text}`).join("\n\n");

    const resp = await safeResponsesCreate({
      model: process.env.OPENAI_MODEL_PRIMARY || "gpt-5",
      input: [
        { role: "system", content: iepSystem },
        { role: "user", content: text.slice(0, 120_000) }
      ],
      response_format: { type: "json_schema", json_schema: { name: "IepExtract", schema: iepSchema, strict: true } }
    } as any);

    const parsed = (resp as any)?.output?.[0]?.content?.[0]?.text;
    const data = parsed ? JSON.parse(parsed) : null;
    try {
      const u = (resp as any)?.usage || {};
      const model = (resp as any)?.model || (process.env.OPENAI_MODEL_PRIMARY || "gpt-5");
      const cost = computeCostCents({ model, input_tokens: u.input_tokens||0, output_tokens: u.output_tokens||0, cached_tokens: u.cached_tokens||0 }, MODEL_RATES);
      await (prisma as any).agent_runs.create({ data: { org_id: (req as any).orgId || null, user_id: null, child_id: null, intent: "iep_extract", route: "/documents/:id/extract/iep", inputs_json: { documentId }, outputs_json: data||{}, tokens: (u.input_tokens||0)+(u.output_tokens||0), cost_cents: cost } });
    } catch {}
    if (!data) return reply.status(400).send({ error: "Extraction failed" });

    // Upsert structured columns into iep_extract
    await prisma.$executeRawUnsafe(
      `INSERT INTO iep_extract (document_id, services_json, goals_json, accommodations_json, placement, start_date, end_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (document_id) DO UPDATE SET
         services_json = EXCLUDED.services_json,
         goals_json = EXCLUDED.goals_json,
         accommodations_json = EXCLUDED.accommodations_json,
         placement = EXCLUDED.placement,
         start_date = EXCLUDED.start_date,
         end_date = EXCLUDED.end_date,
         notes = EXCLUDED.notes`,
      documentId,
      JSON.stringify(data.services || []),
      JSON.stringify(data.goals || []),
      JSON.stringify(data.accommodations || []),
      data.placement || null,
      data?.dates?.start ? new Date(data.dates.start) : null,
      data?.dates?.end ? new Date(data.dates.end) : null,
      null
    );

    return reply.send({ ok: true });
  });
}

