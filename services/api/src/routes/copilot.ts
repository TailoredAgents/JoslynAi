import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { OpenAI } from "openai";
import { orgIdFromRequest, resolveChildId } from "../lib/child.js";
import { retrieveForAsk } from "@joslyn-ai/core/rag/retriever";
import { normalizeAndLimit, type CitationGroup } from "@joslyn-ai/core/rag/citations";
import { enqueue } from "../lib/redis.js";
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


    if (intentInfo.intent === "denial.translate") {
      const actions = intentInfo.actions.map((action) => {
        if (!action.href || !childId) return action;
        const sep = action.href.includes("?") ? "&" : "?";
        return { ...action, href: `${action.href}${sep}child=${childId}` };
      });

      const rows = await (prisma as any).$queryRawUnsafe(
        `SELECT de.*, de.updated_at, e.document_id
           FROM denial_explanations de
           JOIN eobs e ON e.id = de.eob_id
           JOIN claims c ON c.id = e.claim_id
          WHERE c.child_id = $1
          ORDER BY de.updated_at DESC
          LIMIT 1`,
        childId
      );
      const explanationRow = rows?.[0];

      if (!explanationRow) {
        const latestEob = await (prisma as any).$queryRawUnsafe(
          `SELECT e.id as eob_id, e.document_id, c.org_id
             FROM eobs e
             JOIN claims c ON c.id = e.claim_id
            WHERE c.child_id = $1
            ORDER BY e.created_at DESC
            LIMIT 1`,
          childId
        );
        const candidate = latestEob?.[0];
        if (candidate?.eob_id && candidate?.document_id) {
          await enqueue({
            kind: "denial_explain",
            eob_id: candidate.eob_id,
            document_id: candidate.document_id,
            child_id: childId,
            org_id: candidate.org_id || orgId,
          });
          await (prisma as any).denial_explanations.upsert({
            where: { eob_id: candidate.eob_id },
            update: { status: "pending" },
            create: {
              eob_id: candidate.eob_id,
              document_id: candidate.document_id,
              child_id: childId,
              org_id: candidate.org_id || orgId,
              explanation_json: {},
              next_steps_json: [],
              citations_json: [],
              status: "pending",
            },
          });
          return reply.send({
            intent: intentInfo.intent,
            answer: withDisclaimer("I'm reviewing that denial now. Give me a minute and open the appeal kit tab for the full breakdown."),
            citations: [],
            actions,
            follow_ups: ["Open the appeal toolkit"],
            summary: null,
            artifacts: [],
          });
        }
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer("I couldn't find a denial yet. Upload the EOB or denial letter and I'll translate it."),
          citations: [],
          actions,
          follow_ups: ["Upload the denial"],
          summary: null,
          artifacts: [],
        });
      }

      if (explanationRow.status === "pending") {
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer("I'm still translating that denial. Check back in a moment."),
          citations: [],
          actions,
          follow_ups: ["Refresh denial explanation"],
          summary: null,
          artifacts: [],
        });
      }

      if (explanationRow.status === "error") {
        await enqueue({
          kind: "denial_explain",
          eob_id: explanationRow.eob_id,
          document_id: explanationRow.document_id,
          child_id: childId,
          org_id: orgId,
        });
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer("The last translation hit an issue, so I'm running it again. I'll share the details shortly."),
          citations: [],
          actions,
          follow_ups: ["Refresh denial explanation"],
          summary: null,
          artifacts: [],
        });
      }

      const explanationJson = (explanationRow as any).explanation_json || {};
      const nextSteps = ((explanationRow as any).next_steps_json || []) as any[];
      const citationsRaw = ((explanationRow as any).citations_json || []) as any[];

      const lines: string[] = [];
      const overview = explanationJson.overview || "Here's what I found.";
      lines.push(overview);
      const codes = Array.isArray(explanationJson.codes) ? explanationJson.codes : [];
      if (codes.length) {
        const details = codes
          .slice(0, 3)
          .map((item: any) => {
            const label = item?.code ? `${item.code}: ` : "";
            return `${label}${item?.plain_language || "Coverage code"}`;
          })
          .join("\n- ");
        lines.push(`Codes:
- ${details}`);
      }
      if (nextSteps.length) {
        const steps = nextSteps
          .slice(0, 3)
          .map((item: any) => `- ${item?.action || "Follow up"}: ${item?.details || ""}`)
          .join("\n");
        lines.push(`Next steps:
${steps}`);
      }
      if (explanationJson.appeal_recommended) {
        lines.push(explanationJson.appeal_reason ? `Consider appealing: ${explanationJson.appeal_reason}` : "This denial looks appealable - let's start a kit.");
      }
      lines.push("Open the appeal kit tab if you want Joslyn to start drafting paperwork.");

      const answerText = lines.join("\n\n");
      const citationsPayload = citationsRaw.map((c: any, idx: number) => ({
        index: idx + 1,
        document_id: c?.document_id,
        doc_name: c?.doc_name,
        page: c?.page,
        snippet: c?.snippet,
      }));

      const followUps = explanationJson.appeal_recommended
        ? ["Start an appeal kit", "Draft a response letter"]
        : ["What should I say to the insurer?", "Show me supporting evidence"];

      return reply.send({
        intent: intentInfo.intent,
        answer: withDisclaimer(answerText),
        citations: citationsPayload,
        actions,
        follow_ups: followUps,
        summary: overview,
        artifacts: [],
      });
    }

    if (intentInfo.intent === "iep.diff") {
      const diff = await (prisma as any).iep_diffs.findFirst({
        where: { child_id: childId },
        orderBy: { created_at: "desc" },
      });

      let answerText = "I haven't spotted an IEP comparison yet.";
      let summaryText: string | null = null;
      let followUps: string[] = [];
      let citationsPayload: any[] = [];
      const actions = intentInfo.actions.map((action) => {
        if (!action.href || !childId) return action;
        const sep = action.href.includes("?") ? "&" : "?";
        return { ...action, href: `${action.href}${sep}child=${childId}` };
      });

      if (!diff) {
        const latest = await (prisma as any).documents.findFirst({
          where: { child_id: childId, type: "iep" },
          orderBy: [{ version: "desc" }, { created_at: "desc" }],
          select: { id: true },
        });
        if (latest?.id) {
          await enqueue({ kind: "prep_iep_diff", document_id: latest.id, child_id: childId, org_id: orgId });
          answerText = "I haven't compared the latest IEP yet, so I'm kicking that off now. Give me a minute, then open the diff tab for the highlights.";
        } else {
          answerText = "I couldn't find two IEP versions to compare yet. Upload the latest plan and I'll run the diff.";
        }
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer(answerText),
          citations: [],
          actions,
          follow_ups: ["Open the IEP diff"],
          summary: null,
          artifacts: [],
        });
      }

      if (diff.status === "pending" || diff.status === "processing") {
        answerText = "I'm still comparing the last two IEPs. Check back in a moment or open the diff tab to see the job status.";
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer(answerText),
          citations: [],
          actions,
          follow_ups: ["Refresh the diff"],
          summary: null,
          artifacts: [],
        });
      }

      if (diff.status === "error") {
        const latest = await (prisma as any).documents.findFirst({
          where: { child_id: childId, type: "iep" },
          orderBy: [{ version: "desc" }, { created_at: "desc" }],
          select: { id: true },
        });
        if (latest?.id) {
          await enqueue({ kind: "prep_iep_diff", document_id: latest.id, child_id: childId, org_id: orgId });
        }
        answerText = "The last comparison hit an error, so I've queued it again. Open the diff tab if you want to watch for the update.";
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer(answerText),
          citations: [],
          actions,
          follow_ups: ["Refresh the diff"],
          summary: null,
          artifacts: [],
        });
      }

      const payload = (diff as any).diff_json || {};
      const riskFlags = ((diff as any).risk_flags_json || []) as any[];
      const citationsRaw = ((diff as any).citations_json || []) as any[];

      summaryText = typeof payload.summary === "string" ? payload.summary : null;
      const changeCount = Array.isArray(payload.minutes_changes) ? payload.minutes_changes.length : 0;
      const goalAdds = Array.isArray(payload.goals_added) ? payload.goals_added.length : 0;
      const goalDrops = Array.isArray(payload.goals_removed) ? payload.goals_removed.length : 0;
      const accomChanges = Array.isArray(payload.accommodations_changed) ? payload.accommodations_changed.length : 0;

      const lines: string[] = [];
      if (summaryText) {
        lines.push(summaryText);
      }
      const changeHighlights: string[] = [];
      if (changeCount) changeHighlights.push(`${changeCount} service minute change${changeCount === 1 ? "" : "s"}`);
      if (goalAdds) changeHighlights.push(`${goalAdds} goal${goalAdds === 1 ? "" : "s"} added`);
      if (goalDrops) changeHighlights.push(`${goalDrops} goal${goalDrops === 1 ? "" : "s"} removed`);
      if (accomChanges) changeHighlights.push(`${accomChanges} accommodation update${accomChanges === 1 ? "" : "s"}`);
      if (changeHighlights.length) {
        lines.push(`Highlights: ${changeHighlights.join(", ")}.`);
      }
      if (riskFlags.length) {
        const topFlag = riskFlags[0];
        lines.push(`Risk flag: ${topFlag?.reason || "Something needs a closer look."}`);
      }
      lines.push("Open the IEP diff tab for the full side-by-side and citations.");
      answerText = lines.join("\n\n");

      citationsPayload = citationsRaw.map((c: any, idx: number) => ({
        index: idx + 1,
        document_id: c?.document_id,
        doc_name: c?.doc_name,
        page: c?.page,
        snippet: c?.snippet,
      }));

      followUps = ["Draft a note about these changes", "What should I ask in the meeting?"];

      return reply.send({
        intent: intentInfo.intent,
        answer: withDisclaimer(answerText),
        citations: citationsPayload,
        actions,
        follow_ups: followUps,
        summary: summaryText,
        artifacts: [],
      });
    }
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

