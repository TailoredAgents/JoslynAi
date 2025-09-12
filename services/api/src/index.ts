import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import documentsRoutes from "./routes/documents";
import askRoutes from "./routes/ask";
import extractRoutes from "./routes/extract";

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    redact: {
      paths: ["req.headers.authorization", "body.password", "body.token", "headers.authorization"],
      remove: true,
    },
  },
});

await app.register(cors, { origin: true, credentials: true });
await app.register(jwt, { secret: process.env.JWT_SECRET || "dev-secret" });

// Simple auth hook: parse JWT if present; set org_id for RLS context
app.addHook("preHandler", async (req, _reply) => {
  const auth = req.headers["authorization"];
  if (auth && auth.startsWith("Bearer ")) {
    try {
      const token = auth.slice(7);
      const decoded = app.jwt.decode(token) as any;
      (req as any).orgId = decoded?.org_id || decoded?.orgId || null;
    } catch {
      // ignore
    }
  }
});

app.get("/health", async () => ({ ok: true }));

// Register feature routes
await app.register(documentsRoutes);
await app.register(askRoutes);
await app.register(extractRoutes);

// Tool endpoints (stubs)
app.post("/tools/doc-ingest", async (_req, reply) => reply.send({ ok: true }));
app.post("/tools/iep-extract", async (_req, reply) => reply.send({ ok: true }));
app.post("/tools/rag-ask", async (_req, reply) => reply.send({ ok: true }));
app.post("/tools/timeline", async (_req, reply) => reply.send({ ok: true }));
app.post("/tools/letter", async (_req, reply) => reply.send({ ok: true }));
app.post("/tools/smart-attachments", async (_req, reply) => reply.send({ ok: true }));
app.post("/tools/form-fill", async (_req, reply) => reply.send({ ok: true }));
app.post("/tools/email-calendar", async (_req, reply) => reply.send({ ok: true }));

const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || "0.0.0.0";
app.listen({ port, host }).then(() => {
  app.log.info(`API listening on http://${host}:${port}`);
}).catch((err) => {
  app.log.error(err, "Failed to start API");
  process.exit(1);
});
