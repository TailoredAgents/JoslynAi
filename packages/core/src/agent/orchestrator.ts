export type AgentTools = {
  ragAsk: (input: { child_id: string; query: string; lang?: string }) => Promise<any>;
  iepExtract: (input: { document_id: string }) => Promise<any>;
  timelineCompute: (input: { child_id: string; kind: string; base_date: string; jurisdiction?: string }) => Promise<any>;
  letterDraft: (input: Record<string, unknown>) => Promise<any>;
  letterRender?: (input: Record<string, unknown>) => Promise<any>;
  letterSend?: (input: Record<string, unknown>) => Promise<any>;
  smartAttachments: (input: Record<string, unknown>) => Promise<any>;
  formPrefill?: (input: Record<string, unknown>) => Promise<any>;
  translate?: (input: Record<string, unknown>) => Promise<any>;
  backTranslate?: (input: Record<string, unknown>) => Promise<any>;
};

type Intent = "understand_iep" | "appeal_denial" | "weekly_review";

type AgentInput = Record<string, any>;

type AgentRunner = (intent: Intent, input: AgentInput, org_id: string, user_id: string) => Promise<any>;

export function createAgentRunner(tools: AgentTools): AgentRunner {
  return async function runAgent(intent, input, org_id, user_id) {
    const _system = `You are a tool-using assistant. Use tools; do not invent facts.
For any claims about the user's case, call ragAsk and include citations.
Never compute dates yourself; call timelineCompute.
Never send letters without explicit user approval (use 'approval' step).
If evidence is insufficient, say "I don't see that in your documents yet."`;

    if (intent === "understand_iep") {
      try {
        await tools.iepExtract({ document_id: input.document_id });
      } catch {
        // ignore extraction failures; agent continues with available context
      }
      const explain = await tools.ragAsk({
        child_id: input.child_id,
        query: "Summarize services, minutes, accommodations, and goals.",
        lang: input.lang || "en"
      });
      let deadline: any = null;
      if (input.base_date) {
        deadline = await tools.timelineCompute({
          child_id: input.child_id,
          kind: "iep_annual_review",
          base_date: input.base_date,
          jurisdiction: input.jurisdiction || "US-*"
        });
      }
      return { explain, deadline };
    }

    if (intent === "appeal_denial") {
      const suggestions = await tools.smartAttachments({
        child_id: input.child_id,
        denial_reason: input.denial_reason
      });
      const draft = await tools.letterDraft({
        kind: "appeal",
        merge_fields: input.merge_fields,
        lang: input.lang || "en"
      });
      return { suggestions, draft };
    }

    if (intent === "weekly_review") {
      return { tips: ["You have 2 deadlines next week", "Consider sending a meeting recap letter"] };
    }

    return { note: "unknown intent" };
  };
}
