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

async function appendConversationEntry(params: { childId: string; orgId: string | null; query: string; intent: string; answer: string; artifacts: any[] }) {
  const { childId, orgId, query, intent, answer, artifacts } = params;
  if (!childId || !answer) return;
  try {
    const entry = {
      query: (query || "").slice(0, 500),
      intent,
      answer: (answer || "").slice(0, 1000),
      artifacts: Array.isArray(artifacts) ? artifacts.map((artifact: any) => {
        if (!artifact || typeof artifact !== "object") return { kind: String(artifact) };
        const normalized: Record<string, any> = { kind: artifact.kind || "unknown" };
        if (artifact.document_id) normalized.document_id = artifact.document_id;
        if (artifact.outline_id) normalized.outline_id = artifact.outline_id;
        if (artifact.one_pager_id) normalized.one_pager_id = artifact.one_pager_id;
        if (artifact.tag) normalized.tag = artifact.tag;
        if (artifact.source) normalized.source = artifact.source;
        return normalized;
      }).filter(Boolean) : [],
      created_at: new Date().toISOString(),
    };

    const existing = await (prisma as any).copilot_conversations.findUnique({ where: { child_id: childId } });
    const messages = Array.isArray(existing?.messages_json) ? existing.messages_json : [];
    const artifactsJson = Array.isArray(existing?.artifacts_json) ? existing.artifacts_json : [];
    messages.push(entry);
    while (messages.length > 20) messages.shift();

    const artifactSet = new Set(artifactsJson.map((item: any) => JSON.stringify(item)));
    entry.artifacts.forEach((artifact) => {
      const key = JSON.stringify(artifact);
      if (!artifactSet.has(key)) {
        artifactSet.add(key);
        artifactsJson.push(artifact);
      }
    });
    while (artifactsJson.length > 50) artifactsJson.shift();

    if (existing) {
      await (prisma as any).copilot_conversations.update({
        where: { child_id: childId },
        data: { messages_json: messages, artifacts_json: artifactsJson, org_id: orgId },
      });
    } else {
      await (prisma as any).copilot_conversations.create({
        data: { child_id: childId, org_id: orgId, messages_json: messages, artifacts_json: artifactsJson },
      });
    }
  } catch (err) {
    console.error("[COPILOT] appendConversationEntry failed:", err);
  }
}

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
  if (/one[ -]?pager|onepager|snapshot/.test(normalized)) {
    return { intent: "one_pager.generate", tags: ["iep", "eval_report"], actions: [{ type: "open_tab", label: "Open one-pagers", href: "/one-pagers" }] };
  }
  if (/what should i say|how should i say|phrase|wording/.test(normalized)) {
    return { intent: "safety.phrase", tags: ["iep", "eval_report"], actions: [{ type: "open_tab", label: "Open safety phrases", href: "/safety/phrases" }] };
  }
  if (/denial|eob|explain code/.test(normalized)) {
    return { intent: "denial.translate", tags: ["denial_letter", "eob"], actions: [{ type: "open_tab", label: "Start appeal kit", href: "/appeals" }] };
  }
  if (/appeal kit/.test(normalized) || (/appeal/.test(normalized) && /kit/.test(normalized))) {
    return { intent: "appeal.kit", tags: [], actions: [{ type: "open_tab", label: "Open appeal kits", href: "/appeals" }] };
  }
  if (/mediation|complaint|state complaint|due process/.test(normalized)) {
    return { intent: "advocacy.outline", tags: ["iep", "eval_report"], actions: [{ type: "open_tab", label: "Open advocacy outline", href: "/advocacy/outlines" }] };
  }
  if (/smart/.test(normalized) && /goal/.test(normalized)) {
    return { intent: "goals.smart", tags: ["iep"], actions: [{ type: "open_tab", label: "Score SMART goal", href: "/goals" }] };
  }
  if ((/summary|explain/.test(normalized)) && (/report|evaluation/.test(normalized))) {
    return { intent: "research.explain", tags: [], actions: [{ type: "open_tab", label: "Open research summaries", href: "/research" }] };
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

    const originalSend = reply.send.bind(reply);
    (reply as any).send = (payload: any) => {
      if (payload && typeof payload === "object" && childId) {
        const answerText = typeof payload.answer === "string" ? payload.answer : "";
        if (answerText) {
          const artifactsValue = Array.isArray(payload.artifacts) ? payload.artifacts : [];
          appendConversationEntry({
            childId,
            orgId: orgId ?? null,
            query,
            intent: payload.intent || intentInfo.intent,
            answer: answerText,
            artifacts: artifactsValue,
          }).catch((err) => {
            try {
              (req as any).log?.warn?.({ err }, "copilot conversation append failed");
            } catch {}
          });
        }
      }
      return originalSend(payload);
    };


    if (intentInfo.intent === "recommendations.supports") {
      const actions = intentInfo.actions.map((action) => {
        if (!action.href || !childId) return action;
        const sep = action.href.includes("?") ? "&" : "?";
        return { ...action, href: `${action.href}${sep}child=${childId}` };
      });

      const sourceKind = "auto";
      const record = await (prisma as any).recommendations.findFirst({
        where: { child_id: childId, source_kind: sourceKind },
        orderBy: { updated_at: "desc" },
      });

      async function queueRecommendations(documentId?: string | null) {
        if (!documentId) {
          const evalDoc = await (prisma as any).documents.findFirst({
            where: { child_id: childId, type: "eval_report" },
            orderBy: { created_at: "desc" },
          });
          if (evalDoc?.id) {
            documentId = evalDoc.id;
          } else {
            const iepDoc = await (prisma as any).documents.findFirst({
              where: { child_id: childId, type: "iep" },
              orderBy: [{ version: "desc" }, { created_at: "desc" }],
            });
            if (iepDoc?.id) {
              documentId = iepDoc.id;
            }
          }
        }

        if (documentId) {
          await enqueue({ kind: "prep_recommendations", child_id: childId, org_id: orgId, document_id: documentId, source: sourceKind });
          await (prisma as any).recommendations.upsert({
            where: { child_id_source_kind: { child_id: childId, source_kind: sourceKind } } as any,
            update: { status: "pending" },
            create: {
              child_id: childId,
              org_id: orgId,
              source_kind: sourceKind,
              recommendations_json: [],
              citations_json: [],
              request_hash: null,
              locale: "en",
              status: "pending",
            },
          });
          return true;
        }
        return false;
      }

      if (!record) {
        const queued = await queueRecommendations(null);
        if (queued) {
          return reply.send({
            intent: intentInfo.intent,
            answer: withDisclaimer("Let me review the latest reports to suggest supports. Give me a minute and open the recommendations tab."),
            citations: [],
            actions,
            follow_ups: ["Refresh recommendations"],
            summary: null,
            artifacts: [],
          });
        }
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer("Upload an IEP or evaluation so I can suggest accommodations with citations."),
          citations: [],
          actions,
          follow_ups: ["Upload a document"],
          summary: null,
          artifacts: [],
        });
      }

      if (record.status === "pending") {
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer("I'm drafting those recommendations. Refresh the recommendations tab in a moment."),
          citations: [],
          actions,
          follow_ups: ["Refresh recommendations"],
          summary: null,
          artifacts: [],
        });
      }

      if (record.status === "error") {
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer("I hit a snag generating recommendations. Try regenerating from the recommendations tab."),
          citations: [],
          actions,
          follow_ups: ["Regenerate recommendations"],
          summary: null,
          artifacts: [],
        });
      }

      if (record.status === "empty") {
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer("I didn't see enough evidence to recommend new supports yet. Highlight the areas you want me to use and try again."),
          citations: [],
          actions,
          follow_ups: ["Upload more documents"],
          summary: null,
          artifacts: [],
        });
      }

      const recPayload = Array.isArray(record.recommendations_json) ? record.recommendations_json : [];
      const citationsRaw = Array.isArray(record.citations_json) ? record.citations_json : [];
      const citations = citationsRaw.map((entry: any, idx: number) => ({
        index: idx + 1,
        document_id: entry.document_id,
        doc_name: entry.doc_name,
        page: entry.page,
        snippet: entry.snippet,
        span_id: entry.span_id,
      }));
      const spanIndex = new Map<string, number>();
      citationsRaw.forEach((entry: any, idx: number) => {
        if (entry?.span_id) {
          spanIndex.set(String(entry.span_id), idx + 1);
        }
      });

      const lines: string[] = [];
      recPayload.slice(0, 3).forEach((rec: any, idx: number) => {
        const title = (rec?.title && String(rec.title).trim()) || `Recommendation ${idx + 1}`;
        const recommendation = rec?.recommendation || rec?.support || "";
        const rationale = rec?.rationale || "";
        const indices = Array.isArray(rec?.citations)
          ? rec.citations
              .map((spanId: any) => spanIndex.get(String(spanId)) as number | undefined)
              .filter((num: number | undefined): num is number => typeof num === "number")
          : [];
        const citationNote = indices.length ? ` ${indices.map((n: number) => `[${n}]`).join("")}` : "";
        if (recommendation) {
          lines.push(`${title}: ${recommendation}${citationNote}`);
        }
        if (rationale) {
          lines.push(`Why: ${rationale}`);
        }
      });

      if (!lines.length) {
        lines.push("I didn't find a support I could back with citations yet.");
      } else {
        lines.push("Open the recommendations tab for bilingual drafts you can copy into letters.");
      }

      const followUps = ["Insert into letter", "Show Spanish versions"];
      const artifacts = [{ kind: "recommendations", source: record.source_kind, child_id: childId }];
      const answerText = lines.join("\n\n");
      const sanitizedCitations = citations.map(({ span_id, ...rest }: any) => rest);

      return reply.send({
        intent: intentInfo.intent,
        answer: withDisclaimer(answerText),
        citations: sanitizedCitations,
        actions,
        follow_ups: followUps,
        summary: null,
        artifacts,
      });
    }

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




if (intentInfo.intent === "goals.smart") {
  const actionsBase = intentInfo.actions.map((action) => {
    if (!action.href || !childId) return action;
    const sep = action.href.includes("?") ? "&" : "?";
    return { ...action, href: `${action.href}${sep}child=${childId}` };
  });
  const actions = [...actionsBase, { type: "open_tab", label: "Open SMART goal assistant", href: `/goals?child=${childId}` }];

  const trimmed = query.trim();
  const looksLikeGoal = trimmed.length > 80 || trimmed.includes("\n");

  if (looksLikeGoal) {
    const identifier = `chat-goal-${Date.now()}`;
    await (prisma as any).goal_rewrites.upsert({
      where: { child_id_goal_identifier: { child_id: childId, goal_identifier: identifier } },
      update: { status: "pending" },
      create: {
        child_id: childId,
        org_id: orgId,
        document_id: null,
        goal_identifier: identifier,
        rubric_json: [],
        rewrite_json: { rewrite: "", baseline: "", measurement_plan: "", citations: [] },
        citations_json: [],
        status: "pending",
      },
    });
    await enqueue({
      kind: "goal_smart",
      child_id: childId,
      org_id: orgId,
      document_id: null,
      goal_identifier: identifier,
      goal_text: trimmed,
    });
    return reply.send({
      intent: intentInfo.intent,
      answer: withDisclaimer("I'm scoring and rewriting that goal now. Check the SMART goal tab soon for the draft."),
      citations: [],
      actions,
      follow_ups: ["Refresh SMART rewrites"],
      summary: null,
      artifacts: [],
    });
  }

  const latestRewrite = await (prisma as any).goal_rewrites.findFirst({
    where: { child_id: childId },
    orderBy: { updated_at: "desc" },
  });

  if (!latestRewrite) {
    return reply.send({
      intent: intentInfo.intent,
      answer: withDisclaimer("Paste the goal text or open the SMART goal assistant so I can help rewrite it."),
      citations: [],
      actions,
      follow_ups: ["Open SMART goal assistant"],
      summary: null,
      artifacts: [],
    });
  }

  if (latestRewrite.status === "pending") {
    return reply.send({
      intent: intentInfo.intent,
      answer: withDisclaimer("I'm still evaluating that goal. Give me another moment and refresh the SMART goal assistant."),
      citations: [],
      actions,
      follow_ups: ["Refresh SMART rewrites"],
      summary: null,
      artifacts: [],
    });
  }

  const rubric = Array.isArray(latestRewrite.rubric_json) ? latestRewrite.rubric_json : [];
  const rewriteJson = latestRewrite.rewrite_json || {};
  const rewriteText = rewriteJson.rewrite || "Here's a clearer rewrite ready for the assistant.";
  const baseline = rewriteJson.baseline;
  const plan = rewriteJson.measurement_plan;
  const lines: string[] = [];
  lines.push(`Goal ${latestRewrite.goal_identifier}: ${rewriteText}`);
  if (baseline) lines.push(`Baseline: ${baseline}`);
  if (plan) lines.push(`Measurement plan: ${plan}`);
  if (rubric.length) {
    const summary = rubric.map((item: any) => `${item.criterion || "SMART"}: ${item.rating || "Needs review"}`).join("; ");
    lines.push(`Rubric summary: ${summary}`);
  }
  lines.push("Open the SMART goal assistant to copy or confirm the rewrite.");

  const citationsPayload = Array.isArray(latestRewrite.citations_json) ? latestRewrite.citations_json : [];
  const followUps = ["Draft progress probes", "What should I tell the team?"];

  return reply.send({
    intent: intentInfo.intent,
    answer: withDisclaimer(lines.join("\n\n")),
    citations: citationsPayload,
    actions,
    follow_ups: followUps,
    summary: rewriteText,
    artifacts: [{ kind: "goal_rewrite", id: latestRewrite.id }],
  });
}


    if (intentInfo.intent === "advocacy.outline") {
      const actions = intentInfo.actions.map((action) => {
        if (!action.href || !childId) return action;
        const sep = action.href.includes("?") ? "&" : "?";
        return { ...action, href: `${action.href}${sep}child=${childId}` };
      });

      async function queueOutline(documentId?: string | null) {
        let targetDocument = documentId || null;
        if (!targetDocument) {
          const evalDoc = await (prisma as any).documents.findFirst({
            where: { child_id: childId, type: "eval_report" },
            orderBy: [{ created_at: "desc" }],
            select: { id: true },
          });
          if (evalDoc?.id) {
            targetDocument = evalDoc.id;
          } else {
            const iepDoc = await (prisma as any).documents.findFirst({
              where: { child_id: childId, type: "iep" },
              orderBy: [{ version: "desc" }, { created_at: "desc" }],
              select: { id: true },
            });
            if (iepDoc?.id) {
              targetDocument = iepDoc.id;
            } else {
              const anyDoc = await (prisma as any).documents.findFirst({
                where: { child_id: childId },
                orderBy: [{ created_at: "desc" }],
                select: { id: true },
              });
              targetDocument = anyDoc?.id || null;
            }
          }
        }
        if (!targetDocument) return null;
        const created = await (prisma as any).advocacy_outlines.create({
          data: {
            child_id: childId,
            org_id: orgId,
            outline_kind: "mediation",
            outline_json: {
              document_id: targetDocument,
              outline_kind: "mediation",
              summary: "",
              facts: [],
              attempts: [],
              remedies: [],
              next_steps: [],
              closing: "",
            },
            citations_json: [],
            status: "pending",
          },
        });
        await enqueue({
          kind: "build_advocacy_outline",
          outline_id: created.id,
          child_id: childId,
          org_id: orgId,
          document_id: targetDocument,
          outline_kind: "mediation",
        });
        return created;
      }

      const outline = await (prisma as any).advocacy_outlines.findFirst({
        where: { child_id: childId },
        orderBy: { updated_at: "desc" },
      });

      if (!outline) {
        const created = await queueOutline(null);
        if (created) {
          return reply.send({
            intent: intentInfo.intent,
            answer: withDisclaimer("I'm drafting an outline now. Give me a minute and open the advocacy tab for the full breakdown."),
            citations: [],
            actions,
            follow_ups: ["Refresh advocacy outline"],
            summary: null,
            artifacts: [],
          });
        }
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer("Upload an evaluation or IEP so I can draft a mediation or complaint outline."),
          citations: [],
          actions,
          follow_ups: ["Upload supporting documents"],
          summary: null,
          artifacts: [],
        });
      }

      if (outline.status === "pending") {
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer("I'm still organizing that outline. Refresh the advocacy tab in a moment."),
          citations: [],
          actions,
          follow_ups: ["Refresh advocacy outline"],
          summary: null,
          artifacts: [],
        });
      }

      if (outline.status === "error") {
        const docId = outline.outline_json?.document_id || null;
        await queueOutline(docId);
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer("I hit a snag drafting that outline. I queued it again—check the advocacy tab shortly."),
          citations: [],
          actions,
          follow_ups: ["Refresh advocacy outline"],
          summary: null,
          artifacts: [],
        });
      }

      const outlineJson = outline.outline_json || {};
      const facts = Array.isArray(outlineJson.facts) ? outlineJson.facts : [];
      const attempts = Array.isArray(outlineJson.attempts) ? outlineJson.attempts : [];
      const remedies = Array.isArray(outlineJson.remedies) ? outlineJson.remedies : [];
      const nextSteps = Array.isArray(outlineJson.next_steps) ? outlineJson.next_steps : [];
      const citationsRaw = Array.isArray(outline.citations_json) ? outline.citations_json : [];
      const citations = citationsRaw.map((entry: any, idx: number) => ({
        index: idx + 1,
        document_id: entry.document_id,
        doc_name: entry.doc_name,
        page: entry.page,
        snippet: entry.snippet,
      }));

      const citationLookup = new Map<string, number>();
      citationsRaw.forEach((entry: any, idx: number) => {
        if (entry?.span_id) {
          citationLookup.set(String(entry.span_id), idx + 1);
        }
      });

      const lines: string[] = [];
      if (outlineJson.summary) {
        lines.push(outlineJson.summary);
      }
      facts.slice(0, 2).forEach((item: any, idx: number) => {
        const label = citationLookup.get(String((item?.citations || [])[0]));
        const badge = label ? ` [${label}]` : "";
        lines.push(`Fact ${idx + 1}: ${item.detail || ""}${badge}`);
      });
      remedies.slice(0, 2).forEach((item: any, idx: number) => {
        const label = citationLookup.get(String((item?.citations || [])[0]));
        const badge = label ? ` [${label}]` : "";
        lines.push(`Remedy ${idx + 1}: ${item.remedy || ""}${badge}`);
      });
      if (!lines.length) {
        lines.push("I drafted the outline, but I did not find a solid evidence-backed entry yet.");
      } else {
        lines.push("Open the advocacy tab to review the full outline, edit language, and export a letter.");
      }

      return reply.send({
        intent: intentInfo.intent,
        answer: withDisclaimer(lines.join("\n\n")),
        citations,
        actions,
        follow_ups: ["Draft mediation letter", "Explain requested remedies"],
        summary: outlineJson.summary || null,
        artifacts: [{ kind: "advocacy_outline", outline_id: outline.id }],
      });
    }

    if (intentInfo.intent === "safety.phrase") {
      const actions = intentInfo.actions.map((action) => {
        if (!action.href || !childId) return action;
        const sep = action.href.includes("?") ? "&" : "?";
        return { ...action, href: `${action.href}${sep}child=${childId}` };
      });

      const normalized = query.toLowerCase();
      let tag = "general";
      if (/minutes|time/.test(normalized)) tag = "minutes_down";
      else if (/appeal|denial/.test(normalized)) tag = "appeal";
      else if (/tone|support/.test(normalized)) tag = "tone_support";

      const phrases = await (prisma as any).safety_phrases.findMany({
        where: {
          tag,
          status: "active",
          OR: [{ org_id: orgId }, { org_id: null }],
        },
        orderBy: { updated_at: "desc" },
        take: 3,
      });

      if (!phrases?.length) {
        await enqueue({
          kind: "generate_safety_phrase",
          child_id: childId,
          org_id: orgId,
          tag,
          contexts: [],
        });
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer("I am drafting phrasing suggestions now. Check the safety phrases tab shortly."),
          citations: [],
          actions,
          follow_ups: ["Refresh safety phrases"],
          summary: null,
          artifacts: [],
        });
      }

      const top = phrases[0];
      const content = top.content_json || {};
      const lines: string[] = [];
      if (content.phrase_en) lines.push(content.phrase_en);
      if (content.phrase_es) lines.push(`ES: ${content.phrase_es}`);
      if (content.rationale) lines.push(`Why it helps: ${content.rationale}`);
      if (!lines.length) lines.push("Here is a gentle suggestion you can adapt.");
      lines.push("Open the safety phrases tab for more tone options and to queue new wording.");

      return reply.send({
        intent: intentInfo.intent,
        answer: withDisclaimer(lines.join("\n\n")),
        citations: [],
        actions,
        follow_ups: ["Queue a new phrase", "Share with the team"],
        summary: content.phrase_en || null,
        artifacts: [{ kind: "safety_phrase", tag }],
      });
    }

    if (intentInfo.intent === "one_pager.generate") {
      const actions = intentInfo.actions.map((action) => {
        if (!action.href || !childId) return action;
        const sep = action.href.includes("?") ? "&" : "?";
        return { ...action, href: `${action.href}${sep}child=${childId}` };
      });

      async function selectDocumentId() {
        const evalDoc = await (prisma as any).documents.findFirst({
          where: { child_id: childId, type: "eval_report" },
          orderBy: [{ created_at: "desc" }],
          select: { id: true },
        });
        if (evalDoc?.id) return evalDoc.id;
        const iepDoc = await (prisma as any).documents.findFirst({
          where: { child_id: childId, type: "iep" },
          orderBy: [{ version: "desc" }, { created_at: "desc" }],
          select: { id: true },
        });
        if (iepDoc?.id) return iepDoc.id;
        const anyDoc = await (prisma as any).documents.findFirst({
          where: { child_id: childId },
          orderBy: [{ created_at: "desc" }],
          select: { id: true },
        });
        return anyDoc?.id || null;
      }

      async function queueOnePager() {
        const documentId = await selectDocumentId();
        const record = await (prisma as any).one_pagers.create({
          data: {
            child_id: childId,
            org_id: orgId,
            audience: "teacher",
            language_primary: "en",
            language_secondary: "es",
            content_json: {},
            citations_json: [],
            status: "pending",
          },
        });
        await enqueue({
          kind: "build_one_pager",
          one_pager_id: record.id,
          child_id: childId,
          org_id: orgId,
          audience: "teacher",
          document_id: documentId,
          language_primary: "en",
          language_secondary: "es",
        });
        return record;
      }

      const onePager = await (prisma as any).one_pagers.findFirst({
        where: { child_id: childId },
        orderBy: { updated_at: "desc" },
      });

      if (!onePager) {
        const queued = await queueOnePager();
        if (queued) {
          return reply.send({
            intent: intentInfo.intent,
            answer: withDisclaimer("I am drafting that one-pager now. Check the one-pagers tab shortly."),
            citations: [],
            actions,
            follow_ups: ["Refresh one-pagers"],
            summary: null,
            artifacts: [],
          });
        }
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer("Upload an evaluation or IEP and I can build a bilingual snapshot."),
          citations: [],
          actions,
          follow_ups: ["Upload supporting documents"],
          summary: null,
          artifacts: [],
        });
      }

      if (onePager.status === "pending") {
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer("I'm still pulling that information together. Refresh the one-pagers tab in a moment."),
          citations: [],
          actions,
          follow_ups: ["Refresh one-pagers"],
          summary: null,
          artifacts: [],
        });
      }

      if (onePager.status === "error") {
        await queueOnePager();
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer("I hit a snag formatting that one-pager. I queued it again, so check back in the one-pagers tab."),
          citations: [],
          actions,
          follow_ups: ["Refresh one-pagers"],
          summary: null,
          artifacts: [],
        });
      }

      const content = onePager.content_json || {};
      const citationsRaw = Array.isArray(onePager.citations_json) ? onePager.citations_json : [];
      const citations = citationsRaw.map((entry: any, idx: number) => ({
        index: idx + 1,
        document_id: entry.document_id,
        doc_name: entry.doc_name,
        page: entry.page,
        snippet: entry.snippet,
      }));

      const lines: string[] = [];
      if (content.title) lines.push(content.title);
      if (content.intro_en) lines.push(`English intro: ${content.intro_en}`);
      if (content.intro_es) lines.push(`Spanish intro: ${content.intro_es}`);
      (content.sections || []).slice(0, 2).forEach((section: any, idx: number) => {
        const firstCitation = (section.citations || [])[0];
        const label = citationsRaw.findIndex((entry: any) => String(entry.span_id) === String(firstCitation));
        const badge = label >= 0 ? ` [${label + 1}]` : "";
        lines.push(`Section ${idx + 1}: ${section.heading}${badge}`);
      });
      if (!lines.length) {
        lines.push("I drafted the outline, but I need a bit more evidence before sharing snippets.");
      } else {
        lines.push("Open the one-pagers tab to review the bilingual version and copy the share link.");
      }

      return reply.send({
        intent: intentInfo.intent,
        answer: withDisclaimer(lines.join("\n\n")),
        citations,
        actions,
        follow_ups: ["Publish one-pager", "Draft follow-up email"],
        summary: content.intro_en || null,
        artifacts: [{ kind: "one_pager", one_pager_id: onePager.id }],
      });
    }

    if (intentInfo.intent === "research.explain") {
      const actions = intentInfo.actions.map((action) => {
        if (!action.href || !childId) return action;
        const sep = action.href.includes("?") ? "&" : "?";
        return { ...action, href: `${action.href}${sep}child=${childId}` };
      });

      async function queueResearch(documentId?: string | null) {
        let targetId = documentId;
        if (!targetId) {
          const latestEval = await (prisma as any).documents.findFirst({
            where: { child_id: childId, type: "eval_report" },
            orderBy: [{ created_at: "desc" }],
            select: { id: true, org_id: true },
          });
          if (latestEval?.id) {
            targetId = latestEval.id;
          } else {
            const latestDoc = await (prisma as any).documents.findFirst({
              where: { child_id: childId },
              orderBy: [{ created_at: "desc" }],
              select: { id: true, org_id: true },
            });
            if (latestDoc?.id) {
              targetId = latestDoc.id;
            }
          }
        }

        if (!targetId) return false;
        const docInfo = await (prisma as any).documents.findUnique({
          where: { id: targetId },
          select: { id: true, child_id: true, org_id: true },
        });
        if (!docInfo) return false;

        await enqueue({
          kind: "research_summary",
          document_id: docInfo.id,
          child_id: docInfo.child_id,
          org_id: docInfo.org_id || orgId,
        });

        await (prisma as any).research_summaries.upsert({
          where: { document_id: docInfo.id },
          update: { status: "pending" },
          create: {
            document_id: docInfo.id,
            org_id: docInfo.org_id || orgId,
            summary_json: {},
            glossary_json: [],
            citations_json: [],
            reading_level: null,
            status: "pending",
          },
        });
        return true;
      }

      const rows = await (prisma as any).$queryRawUnsafe(
        `SELECT rs.*, d.original_name AS doc_name, d.type AS doc_type
           FROM research_summaries rs
           JOIN documents d ON d.id = rs.document_id
          WHERE d.child_id = $1
          ORDER BY rs.updated_at DESC
          LIMIT 1`,
        childId
      );
      const latestSummary = rows?.[0];

      if (!latestSummary) {
        const queued = await queueResearch(null);
        if (queued) {
          return reply.send({
            intent: intentInfo.intent,
            answer: withDisclaimer("I'm reviewing that report now. Give me a minute and open the research tab for the full explainer."),
            citations: [],
            actions,
            follow_ups: ["Refresh research summary"],
            summary: null,
            artifacts: [],
          });
        }
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer("Upload an evaluation or report and I can summarize it in plain language."),
          citations: [],
          actions,
          follow_ups: ["Upload a report"],
          summary: null,
          artifacts: [],
        });
      }

      if (latestSummary.status === "pending") {
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer("I'm still summarizing that report. Give me another minute and refresh the research tab."),
          citations: [],
          actions,
          follow_ups: ["Refresh research summary"],
          summary: null,
          artifacts: [],
        });
      }

      if (latestSummary.status === "error") {
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer("I hit a snag summarizing that report. Try requesting it again from the research tab."),
          citations: [],
          actions,
          follow_ups: ["Regenerate summary"],
          summary: null,
          artifacts: [],
        });
      }

      const summaryJson = latestSummary.summary_json || {};
      const glossary = Array.isArray(latestSummary.glossary_json) ? latestSummary.glossary_json : [];
      const citationsRaw = Array.isArray(latestSummary.citations_json) ? latestSummary.citations_json : [];
      const citations = citationsRaw.map((entry: any, idx: number) => ({
        index: idx + 1,
        document_id: entry.document_id,
        doc_name: entry.doc_name || latestSummary.doc_name,
        page: entry.page,
        snippet: entry.snippet,
      }));

      const lines: string[] = [];
      if (summaryJson.summary) {
        lines.push(summaryJson.summary);
      }
      if (summaryJson.teacher_voice) {
        lines.push(`Teacher version: ${summaryJson.teacher_voice}`);
      }
      if (summaryJson.caregiver_voice) {
        lines.push(`Caregiver version: ${summaryJson.caregiver_voice}`);
      }
      if (latestSummary.reading_level) {
        lines.push(`Reading level: ${latestSummary.reading_level}`);
      }
      if (glossary.length) {
        const terms = glossary.slice(0, 3)
          .map((item: any) => `${item.term}: ${item.definition}`)
          .join("\n- ");
        lines.push(`Glossary:\n- ${terms}`);
      }
      lines.push("Open the research tab for the full digest, glossary, and bilingual copies.");

      return reply.send({
        intent: intentInfo.intent,
        answer: withDisclaimer(lines.join("\n\n")),

        actions,
        follow_ups: ["Draft a plain-language note", "Share this summary"],
        summary: summaryJson.summary || null,
        artifacts: [{ kind: "research_summary", document_id: latestSummary.document_id }],
      });
    }

    if (intentInfo.intent === "appeal.kit") {
      const actions = intentInfo.actions.map((action) => {
        if (!action.href || !childId) return action;
        const sep = action.href.includes("?") ? "&" : "?";
        return { ...action, href: `${action.href}${sep}child=${childId}` };
      });

      const latestEobRows = await (prisma as any).$queryRawUnsafe(
        `SELECT e.id as eob_id, e.document_id, c.org_id
           FROM eobs e
           JOIN claims c ON c.id = e.claim_id
          WHERE c.child_id = $1
          ORDER BY e.created_at DESC
          LIMIT 1`,
        childId
      );
      const candidate = latestEobRows?.[0];
      if (!candidate?.eob_id || !candidate?.document_id) {
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer("I could not find a denial to build from yet. Upload the EOB or denial letter and I will assemble the kit."),
          citations: [],
          actions,
          follow_ups: ["Upload the denial"],
          summary: null,
          artifacts: [],
        });
      }

      let kit = await (prisma as any).appeal_kits.findFirst({
        where: { child_id: childId, denial_id: candidate.eob_id },
        orderBy: { updated_at: "desc" },
      });
      if (!kit) {
        kit = await (prisma as any).appeal_kits.create({
          data: {
            child_id: childId,
            org_id: orgId,
            denial_id: candidate.eob_id,
            status: "pending",
            metadata_json: {},
            checklist_json: [],
            citations_json: [],
          },
        });
        await enqueue({ kind: "build_appeal_kit", kit_id: kit.id, child_id: childId, org_id: orgId });
      }

      if (kit.status !== "ready") {
        await enqueue({ kind: "build_appeal_kit", kit_id: kit.id, child_id: childId, org_id: orgId });
        return reply.send({
          intent: intentInfo.intent,
          answer: withDisclaimer("I am assembling that appeal kit now. Give me a moment and open the appeals tab to review progress."),
          citations: [],
          actions: [...actions, { type: "open_tab", label: "Open appeal kit", href: `/appeals/${kit.id}` }],
          follow_ups: ["Refresh appeal kit"],
          summary: null,
          artifacts: [],
        });
      }

      const items = await (prisma as any).appeal_kit_items.findMany({
        where: { appeal_kit_id: kit.id },
        orderBy: { created_at: "asc" },
      });
      const cover = items.find((item: any) => item.kind === "cover_letter");
      const checklist = items.find((item: any) => item.kind === "checklist");
      const letterBody = cover?.payload_json?.body || "The appeal letter is ready to review.";
      const lines: string[] = [];
      lines.push(letterBody.split("\n")[0] || letterBody);
      if (kit.metadata_json?.appeal_reason) {
        lines.push(`Why appeal: ${kit.metadata_json.appeal_reason}`);
      }
      lines.push("Joslyn bundled the supporting evidence and a checklist so you can finalize and send the packet.");

      const answerText = lines.join("\n\n");

      const followUps = ["Preview the appeal letter", "What evidence should we include?"];
      const citationsPayload = Array.isArray(kit.citations_json) ? kit.citations_json : [];

      return reply.send({
        intent: intentInfo.intent,
        answer: withDisclaimer(answerText),
        citations: citationsPayload,
        actions: [...actions, { type: "open_tab", label: "Open appeal kit", href: `/appeals/${kit.id}` }],
        follow_ups: followUps,
        summary: kit.metadata_json?.appeal_reason || null,
        artifacts: [{ kind: "appeal_kit", id: kit.id }],
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
            feature: intentInfo.intent,
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