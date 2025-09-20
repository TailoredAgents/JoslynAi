// Lightweight HTTP adapters for orchestrator to call local API endpoints
// Using global fetch (Node 22) with simple wrappers

const API = process.env.INTERNAL_SELF_BASE || "http://localhost:8080";

type ToolContext = {
  orgId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
};

function coerceHeader(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function baseHeaders(ctx: ToolContext): Record<string, string> {
  const headers: Record<string, string> = {};
  const maybeSet = (key: string, value?: string | null) => {
    const coerced = coerceHeader(value);
    if (coerced) headers[key] = coerced;
  };

  maybeSet("x-org-id", ctx.orgId);
  maybeSet("x-user-id", ctx.userId);
  maybeSet("x-user-email", ctx.userEmail);
  maybeSet("x-user-role", ctx.userRole);
  maybeSet("x-internal-key", process.env.INTERNAL_API_KEY || undefined);

  return headers;
}

function jsonHeaders(ctx: ToolContext): Record<string, string> {
  return {
    ...baseHeaders(ctx),
    "Content-Type": "application/json",
  };
}

function postJson(path: string, payload: unknown, ctx: ToolContext) {
  return fetch(`${API}${path}`, {
    method: "POST",
    headers: jsonHeaders(ctx),
    body: JSON.stringify(payload),
  }).then((r) => r.json());
}

function postNoBody(path: string, ctx: ToolContext) {
  return fetch(`${API}${path}`, {
    method: "POST",
    headers: baseHeaders(ctx),
  }).then((r) => r.json());
}

export function createToolsAdapter(ctx: ToolContext) {
  return {
    ragAsk: (b: any) =>
      postJson(`/children/${b.child_id}/ask`, { query: b.query, lang: b.lang || "en" }, ctx),
    iepExtract: (b: any) => postNoBody(`/documents/${b.document_id}/extract/iep`, ctx),
    timelineCompute: (b: any) => postJson(`/tools/timeline/compute-and-create`, b, ctx),
    letterDraft: (b: any) => postJson(`/tools/letter/draft`, b, ctx),
    letterRender: (b: any) => postJson(`/tools/letter/render`, b, ctx),
    letterSend: (b: any) => postJson(`/tools/letter/send`, b, ctx),
    smartAttachments: (b: any) => postJson(`/tools/smart-attachments/suggest`, b, ctx),
    formPrefill: (b: any) => postJson(`/tools/form-fill/prefill`, b, ctx),
    translate: (b: any) => postJson(`/tools/translate`, b, ctx),
    backTranslate: (b: any) => postJson(`/tools/back-translate`, b, ctx),
  } as const;
}
