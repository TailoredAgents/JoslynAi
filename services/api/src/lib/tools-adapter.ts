// Lightweight HTTP adapters for orchestrator to call local API endpoints
// Using global fetch (Node 22) with simple wrappers

const API = process.env.INTERNAL_SELF_BASE || "http://localhost:8080";

type ToolContext = {
  orgId: string;
  userId: string;
  userEmail: string;
  userRole: string;
};

function baseHeaders(ctx: ToolContext): Record<string, string> {
  return {
    "x-org-id": ctx.orgId,
    "x-user-id": ctx.userId,
    "x-user-email": ctx.userEmail,
    "x-user-role": ctx.userRole,
  };
}

function jsonHeaders(ctx: ToolContext): Record<string, string> {
  return {
    ...baseHeaders(ctx),
    "Content-Type": "application/json",
  };
}

export function createToolsAdapter(ctx: ToolContext) {
  return {
    ragAsk: (b: any) =>
      fetch(`${API}/children/${b.child_id}/ask`, {
        method: "POST",
        headers: jsonHeaders(ctx),
        body: JSON.stringify({ query: b.query, lang: b.lang || "en" }),
      }).then((r) => r.json()),
    iepExtract: (b: any) =>
      fetch(`${API}/documents/${b.document_id}/extract/iep`, {
        method: "POST",
        headers: baseHeaders(ctx),
      }).then((r) => r.json()),
    timelineCompute: (b: any) =>
      fetch(`${API}/tools/timeline/compute-and-create`, {
        method: "POST",
        headers: jsonHeaders(ctx),
        body: JSON.stringify(b),
      }).then((r) => r.json()),
    letterDraft: (b: any) =>
      fetch(`${API}/tools/letter/draft`, {
        method: "POST",
        headers: jsonHeaders(ctx),
        body: JSON.stringify(b),
      }).then((r) => r.json()),
    letterRender: (b: any) =>
      fetch(`${API}/tools/letter/render`, {
        method: "POST",
        headers: jsonHeaders(ctx),
        body: JSON.stringify(b),
      }).then((r) => r.json()),
    letterSend: (b: any) =>
      fetch(`${API}/tools/letter/send`, {
        method: "POST",
        headers: jsonHeaders(ctx),
        body: JSON.stringify(b),
      }).then((r) => r.json()),
    smartAttachments: (b: any) =>
      fetch(`${API}/tools/smart-attachments/suggest`, {
        method: "POST",
        headers: jsonHeaders(ctx),
        body: JSON.stringify(b),
      }).then((r) => r.json()),
    formPrefill: (b: any) =>
      fetch(`${API}/tools/form-fill/prefill`, {
        method: "POST",
        headers: jsonHeaders(ctx),
        body: JSON.stringify(b),
      }).then((r) => r.json()),
    translate: (b: any) =>
      fetch(`${API}/tools/translate`, {
        method: "POST",
        headers: jsonHeaders(ctx),
        body: JSON.stringify(b),
      }).then((r) => r.json()),
    backTranslate: (b: any) =>
      fetch(`${API}/tools/back-translate`, {
        method: "POST",
        headers: jsonHeaders(ctx),
        body: JSON.stringify(b),
      }).then((r) => r.json()),
  } as const;
}

