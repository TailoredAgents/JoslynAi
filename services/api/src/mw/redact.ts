import { FastifyInstance } from "fastify";

const REDACT = [
  /\b\d{3}-\d{2}-\d{4}\b/g,            // SSN
  /\b\d{10}\b/g,                       // phone naive
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, // phone common
  /\b\d{1,3}(\.\d{1,3}){3}\b/g,        // IP
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi // email
];

export default async function redact(app: FastifyInstance) {
  app.addHook("preSerialization", async (_req, _reply, payload) => payload as any);
  app.addHook("onSend", async (_req, _reply, payload) => payload as any);
  app.addHook("onResponse", async (req) => {
    const s = (req as any).raw?.url || "";
    if (typeof s === "string" && (s.includes("/tools/letter/send") || s.includes("/children/") || s.includes("/documents/"))) {
      (req as any).log = app.log.child({ redacted: true });
    }
  });
  app.addHook("onRequest", async (req) => {
    const scrub = (x: string) => REDACT.reduce((acc, r) => acc.replace(r, "[REDACTED]"), x);
    try {
      if (typeof (req as any).body === "string") (req as any).body = scrub((req as any).body);
    } catch {}
  });
}


