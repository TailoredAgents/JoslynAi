import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import documentsRoutes from "./routes/documents";
import askRoutes from "./routes/ask";
import extractRoutes from "./routes/extract";
import briefRoutes from "./routes/brief";
import eobRoutes from "./routes/eob";
import { ensureBucket } from "./lib/s3-init";
import timelineTool from "./tools/timeline";
import letterTool from "./tools/letter";
import smartAttachments from "./tools/smart-attachments";
import adminDeadlines from "./routes/admin/deadlines";
import internalEob from "./routes/internal/eob";
import translateTools from "./tools/translate";
import profileRoutes from "./routes/profile";
import icsRoutes from "./routes/ics";
import eligibilityRoutes from "./routes/eligibility";
import adminRules from "./routes/admin/rules";
import agentRoutes from "./routes/agent";
import nbsRoutes from "./routes/next-best-steps";
import adminUsage from "./routes/admin/usage";
import redact from "./mw/redact";
import dsrRoutes from "./routes/dsr";
import billingRoutes from "./routes/billing";
import billingUi from "./routes/billing-ui";
import invitesRoutes from "./routes/invites";
import docUrlRoutes from "./routes/doc_urls";
import rbac from "./mw/rbac";

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
await app.register(cors, { origin: (_origin, cb) => cb(null, true), credentials: true });
await app.register(rateLimit, {
  max: 300,
  timeWindow: "1 minute",
  keyGenerator: (req: any) =>
    (req.headers["x-org-id"] as string) || (req.user?.org_id as string) || (req as any).orgId || req.ip,
});
await app.register(redact);
await app.register(rbac);

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
await app.register(briefRoutes);
await app.register(eobRoutes);
await app.register(timelineTool);
await app.register(letterTool);
await app.register(smartAttachments);
await app.register(adminDeadlines);
await app.register(internalEob);
await app.register(translateTools);
await app.register(profileRoutes);
await app.register(icsRoutes);
await app.register(eligibilityRoutes);
await app.register(adminRules);
await app.register(agentRoutes);
await app.register(nbsRoutes);
await app.register(adminUsage);
await app.register(dsrRoutes);
await app.register(billingRoutes);
await app.register(billingUi);
await app.register(invitesRoutes);
await app.register(docUrlRoutes);

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
  ensureBucket().catch((err) => app.log.warn({ err }, "ensureBucket failed"));
}).catch((err) => {
  app.log.error(err, "Failed to start API");
  process.exit(1);
});
