// For now reuse API HTTP adapters directly (monorepo path)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { tools as httpTools } from "../../../services/api/src/lib/tools-adapter";

type Intent = "understand_iep" | "appeal_denial" | "weekly_review";

export async function runAgent(intent: Intent, input: any, org_id: string, user_id: string) {
  const _system = `You are a tool-using assistant. Use tools; do not invent facts.
For any claims about the user's case, call ragAsk and include citations.
Never compute dates yourself; call timelineCompute.
Never send letters without explicit user approval (use 'approval' step).
If evidence is insufficient, say "I don’t see that in your documents yet."`;

  if (intent === "understand_iep") {
    try { await httpTools.iepExtract({ document_id: input.document_id }); } catch {}
    const explain = await httpTools.ragAsk({ child_id: input.child_id, query: "Summarize services, minutes, accommodations, and goals.", lang: input.lang || "en" });
    let deadline: any = null;
    if (input.base_date) {
      deadline = await httpTools.timelineCompute({ child_id: input.child_id, kind: "iep_annual_review", base_date: input.base_date, jurisdiction: input.jurisdiction || "US-*" });
    }
    return { explain, deadline };
  }

  if (intent === "appeal_denial") {
    const suggestions = await httpTools.smartAttachments({ child_id: input.child_id, denial_reason: input.denial_reason });
    const draft = await httpTools.letterDraft({ kind: "appeal", merge_fields: input.merge_fields, lang: input.lang || "en" });
    return { suggestions, draft };
  }

  if (intent === "weekly_review") {
    return { tips: ["You have 2 deadlines next week", "Consider sending a meeting recap letter"] };
  }

  return { note: "unknown intent" };
}
