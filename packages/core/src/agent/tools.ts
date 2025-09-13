export type ToolResult<T> = Promise<T>;

export interface Tools {
  docIngest(input: { fileKey: string; child_id: string }): ToolResult<{ document_id: string }>;
  iepExtract(input: { document_id: string }): ToolResult<{ ok: true }>;
  ragAsk(input: { child_id: string; query: string; lang?: string }): ToolResult<{ answer: string; citations: any[] }>;
  timelineCompute(input: { child_id: string; kind: string; base_date: string; jurisdiction?: string }): ToolResult<{ deadline_id: string; due_date: string }>;
  letterDraft(input: { kind: string; merge_fields: any; lang?: string }): ToolResult<{ letter_id: string; text: string }>;
  letterRender(input: { letter_id: string }): ToolResult<{ pdf_uri: string }>;
  letterSend(input: { letter_id: string; to: string[]; subject?: string }): ToolResult<{ ok: true }>;
  smartAttachments(input: { child_id: string; denial_reason: string }): ToolResult<{ suggestions: any[] }>;
  formPrefill(input: { form_id: string; answers: any }): ToolResult<{ pdf_uri: string }>;
  translate(input: { text: string; target_lang: string; org_id: string }): ToolResult<{ translated: string }>;
  backTranslate(input: { english_source: string; translated_text: string; source_lang: string }): ToolResult<{ report: string }>;
}

