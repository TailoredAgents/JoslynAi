import { OpenAI } from "openai";

export const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Normalize any input shape to an array of messages with {role, content:[parts]}
function normalizeToMessages(input: any) {
  if (typeof input === "string") {
    return [{ role: "user", content: [{ type: "text", text: input }] }];
  }

  if (Array.isArray(input)) {
    if (input.length && typeof input[0] === "object" && "role" in input[0]) {
      return input;
    }
    if (input.length && typeof input[0] === "object" && "type" in input[0]) {
      return [{ role: "user", content: input }];
    }
  }

  if (input && typeof input === "object" && "role" in input && "content" in input) {
    return [input];
  }

  return [{ role: "user", content: [{ type: "text", text: String(input) }] }];
}

// Keep text only; drop any input_image / audio / anything else
function filterToTextParts(messages: any[]) {
  return messages.map((m: any) => {
    const content = Array.isArray(m?.content)
      ? m.content
      : [{ type: "text", text: String(m?.content ?? "") }];
    const filtered = (content as any[])
      .filter((p: any) =>
        p &&
        typeof p === "object" &&
        ((p.type === "text" && typeof p.text === "string") ||
          (p.type === "input_text" && typeof p.text === "string"))
      )
      .map((p: any) => (p.type === "input_text" ? { type: "text", text: p.text } : p));

    return {
      role: m.role || "user",
      content: filtered.length ? filtered : [{ type: "text", text: "" }],
    };
  });
}

function maybeLogSanitized(original: any, safe: any) {
  if (process.env.OPENAI_LOG_SANITIZED === "1") {
    try {
      const o = JSON.stringify(original);
      const s = JSON.stringify(safe);
      if (o !== s) console.warn("[OpenAI] sanitized non-text/invalid parts from Responses input");
    } catch {}
  }
}

export async function safeResponsesCreate(opts: any) {
  const normalized = normalizeToMessages(opts.input);
  const safeMsgs = filterToTextParts(normalized);
  maybeLogSanitized(opts.input, safeMsgs);
  return client.responses.create({ ...opts, input: safeMsgs });
}
