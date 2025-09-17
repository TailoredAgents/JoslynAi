import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { OpenAI } from "openai";
import { orgIdFromRequest, resolveChildId } from "../lib/child.js";
import { retrieveForAsk } from "@joslyn-ai/core/rag/retriever";
import { normalizeAndLimit, type CitationGroup } from "@joslyn-ai/core/rag/citations";
import { safeResponsesCreate } from "../lib/openai.js";
import { MODEL_RATES, computeCostCents } from "../lib/pricing.js";

const DISCLAIMER = "This guidance is educational only and not legal or medical advice.";

function withDisclaimer(answer: string): string {
  const trimmed = (answer || "").trim();
  if (!trimmed) return DISCLAIMER;
  const lower = trimmed.toLowerCase();
  if (lower.includes("not legal") && lower.includes("medical advice")) return trimmed;
  return `${trimmed}

${DISCLAIMER}`;
}

type UsedSpan = { index: number; document_id: string; doc_name?: string; page?: number; text: string };

type RetrievedSpan = {
  id: string;
  document_id: string;
  doc_name: string;
  page: number;
  text: string;
  [key: string]: any;
};

function detectIntent(query: string): { intent: string; tags: string[]; actions: Array<{ type: string; label: string; href?: string }> } {
  const normalized = (query || "").toLowerCase();
  if (/compare|difference|diff|changed/.test(normalized) && /iep/.test(normalized)) {
    return { intent: "iep.diff", tags: ["iep"], actions: [{ type: "open_tab", label: "Open IEP diff", href: "/iep/diff" }] };
  }
  if (/accommodations?|services?|supports?/.test(normalized) && /request|should/.test(normalized)) {
    return { intent: "recommendations.supports", tags: ["eval_report", "iep"], actions: [{ type: "open_tab", label: "Review recommendations", href: "/recommendations" }] };
  }
  if (/denial|eob|explain code/.test(normalized)) {
    return { intent: "denial.translate", tags: ["denial_letter", "eob"], actions: [{ type: "open_tab", label: "Start appeal kit", href: "/appeals" }] };
  }
  if (/smart/ .test(normalized) && /goal/.test(normalized)) {
    return { intent: "goals.smart", tags: ["iep"], actions: [{ type: "open_tab", label: "Score SMART goal", href: "/letters/goals" }] };
  }
  return { intent: "general.ask", tags: [], actions: [] };
}

const CopilotSchema = {
  name: "CopilotAnswer",
  strict: true,
  schema: {
    type: "object",
    properties: {
      answer: { type: "string" },
      follow_up_prompts: {
        type: "array",
        items: { type: "string" },
        default: []
      },
      summary: { type: ["string", "null"], default: null }
    },
    required: ["answer"],
    additionalProperties: false
  }
};

export default async function routes(app: FastifyInstance) {
  app.post<{ Body: { child_id: string; query: string } }>("/copilot", async (req, reply) => {
    const { child_id, query } = req.body || {};
    if (!query) {
      return reply.status(400).send({ error: "missing_query" });
    }
    const orgId = orgIdFromRequest(req as any);
    const childId = await resolveChildId(child_id, orgId);
    if (!childId) {
      return reply.status(404).send({ error: "child_not_found" });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const intentInfo = detectIntent(query);
    const spans = (await retrieveForAsk(prisma as any, openai, childId, query, 18)) as RetrievedSpan[];

    const docLookup: Record<string, string[]> = {};
    if (spans.length) {
      const ids = Array.from(new Set(spans.map((s: RetrievedSpan) => s.document_id))).filter(Boolean);
      if (ids.length) {
        const docs = await (prisma as any).documents.findMany({ where: { id: { in: ids } }, select: { id: true, doc_tags: true } });
        for (const doc of docs) {
          docLookup[doc.id] = Array.isArray(doc.doc_tags) ? doc.doc_tags : [];
        }
      }
    }

    let grouped = normalizeAndLimit<RetrievedSpan>(spans, {
      tags: docLookup,
      allowedTags: intentInfo.tags,
      maxPerDocument: 2,
      maxTotal: 6
    });
    if (!grouped.length) {
      grouped = normalizeAndLimit<RetrievedSpan>(spans, { maxPerDocument: 2, maxTotal: 6 });
    }

    const flattened: UsedSpan[] = [];
    grouped.forEach((group: CitationGroup<RetrievedSpan>) => {
      group.spans.forEach((span: RetrievedSpan) => {
        flattened.push({
          index: flattened.length + 1,
          document_id: span.document_id,
          doc_name: span.doc_name || group.docName,
          page: typeof span.page === "number" ? span.page : group.pages[0],
          text: span.text || ""
        });
      });
    });

    let answer = "I couldn't find that just yet.";
    let followUps: string[] = [];
    let summary: string | null = null;
    let usedSpans: UsedSpan[] = flattened;

    if (!flattened.length) {
      usedSpans = spans.slice(0, 3).map((span: RetrievedSpan, idx: number) => ({
        index: idx + 1,
        document_id: span.document_id,
        doc_name: span.doc_name,
        page: span.page,
        text: span.text || ""
      }));
    }

    if (usedSpans.length) {
      const excerptBlocks = usedSpans
        .map((span) => `[${span.index}] ${span.doc_name || "Document"} (p.${span.page ?? "?"})\n${(span.text || "").slice(0, 600)}`)
        .join("\n---\n");

      const systemPrompt = "You are Joslyn AI, an IEP/504 co-pilot. Answer with empathy, keep it concise (<=180 words), and cite using bracket numbers that match the excerpts provided (e.g., [1], [2]). Offer practical next steps when possible.";
      const resp = await safeResponsesCreate({
        model: process.env.OPENAI_MODEL_MINI || "gpt-5-mini",
        input: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Parent question: ${query}

Use these excerpts (each labeled). Cite with [n] referencing the excerpt number.
${excerptBlocks}`
          }
        ],
        response_format: { type: "json_schema", json_schema: CopilotSchema } as any
      } as any);

      const text = (resp as any)?.output?.[0]?.content?.[0]?.text;
      if (text) {
        try {
          const parsed = JSON.parse(text);
          answer = parsed.answer || answer;
          followUps = Array.isArray(parsed.follow_up_prompts) ? parsed.follow_up_prompts : [];
          summary = typeof parsed.summary === "string" ? parsed.summary : null;
        } catch (err) {
          answer = text;
        }
      }

      try {
        const usage = (resp as any)?.usage || {};
        const model = (resp as any)?.model || (process.env.OPENAI_MODEL_MINI || "gpt-5-mini");
        const cost = computeCostCents({
          model,
          input_tokens: usage.input_tokens || 0,
          output_tokens: usage.output_tokens || 0,
          cached_tokens: usage.cached_tokens || 0
        }, MODEL_RATES);
        await (prisma as any).agent_runs.create({
          data: {
            org_id: (req as any).orgId || null,
            user_id: null,
            child_id: childId,
            intent: intentInfo.intent,
            route: "/copilot",
            inputs_json: { query },
            outputs_json: { answer, followUps, summary },
            tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
            cost_cents: cost
          }
        });
      } catch {}
    }

    const citations = usedSpans.map((span) => ({
      index: span.index,
      document_id: span.document_id,
      doc_name: span.doc_name,
      page: span.page,
      snippet: (span.text || "").slice(0, 280)
    }));

    const actions = intentInfo.actions.map((action) => {
      if (!action.href || !childId) return action;
      const sep = action.href.includes('?') ? '&' : '?';
      return { ...action, href: `${action.href}${sep}child=${childId}` };
    });

    return reply.send({
      intent: intentInfo.intent,
      answer: withDisclaimer(answer),
      citations,
      actions,
      follow_ups: followUps,
      summary,
      artifacts: []
    });
  });
}

