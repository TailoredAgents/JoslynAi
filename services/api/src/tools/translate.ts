import { FastifyInstance } from "fastify";
import { OpenAI } from "openai";
import { prisma } from "../lib/db.js";

async function applyGlossary(org_id: string | undefined, text: string, target: string) {
  if (!org_id) return text;
  try {
    const g = await (prisma as any).glossaries.findFirst({ where: { org_id } });
    if (!g?.terms_json) return text;
    let out = text;
    const terms = g.terms_json as Record<string, any>;
    // terms like { en: 'occupational therapy', es: 'terapia ocupacional' }
    for (const key of Object.keys(terms)) {
      const val = terms[key];
      const from = (val.en || key) as string;
      const to = (val[target] || val.es || from) as string;
      out = out.replace(new RegExp(from, 'gi'), to);
    }
    return out;
  } catch {
    return text;
  }
}

export default async function routes(app: FastifyInstance) {
  app.post("/tools/translate", async (req, reply) => {
    const { text, target_lang } = (req.body as any);
    const org_id = (req as any).orgId || (req as any).headers?.['x-org-id'] || (req as any).user?.org_id;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const pre = await applyGlossary(org_id, text, target_lang);
    const resp = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL_MINI || "gpt-5-mini",
      messages: [
        { role: "system", content: `Translate to ${target_lang}` },
        { role: "user", content: pre },
      ],
      temperature: 0.2,
    });
    const translated = resp.choices?.[0]?.message?.content || pre;
    return reply.send({ translated });
  });

  app.post("/tools/back-translate", async (req, reply) => {
    const { english_source, translated_text, source_lang = "es" } = (req.body as any);
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const resp = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL_MINI || "gpt-5-mini",
      messages: [
        { role: "system", content: `Back-translate from ${source_lang} to English and report drift succinctly.` },
        { role: "user", content: translated_text },
      ],
      temperature: 0,
    });
    const back = resp.choices?.[0]?.message?.content || "";
    const report = back.trim().toLowerCase() === (english_source || "").trim().toLowerCase() ? "no drift" : back;
    return reply.send({ report });
  });
}


