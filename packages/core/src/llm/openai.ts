// Minimal OpenAI HTTP wrapper using fetch; callers pass API key via env
// Note: endpoints and models are placeholders per project config

export type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string };

export interface ChatOptions {
  model?: string;
  tools?: any[];
  tool_choice?: "auto" | { type: string; function: { name: string } };
  response_format?: any;
}

const OPENAI_API_BASE = process.env.OPENAI_API_BASE || "https://api.openai.com/v1";

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  const model = opts.model || process.env.OPENAI_MODEL_PRIMARY || "gpt-5";
  const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      tools: opts.tools,
      tool_choice: opts.tool_choice,
      response_format: opts.response_format,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI chat error: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function embeddings(input: string | string[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  const model = process.env.OPENAI_EMBEDDINGS_MODEL || "text-embedding-3-small";
  const res = await fetch(`${OPENAI_API_BASE}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings error: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function translate(text: string, targetLang: string) {
  // Simple stub for translation; will integrate external MT later
  // For now, returns original text with a note
  return `[${targetLang}] ${text}`;
}

