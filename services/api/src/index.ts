import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import documentsRoutes from "./routes/documents.js";
import childrenRoutes from "./routes/children.js";
import askRoutes from "./routes/ask.js";
import iepDiffRoutes from "./routes/iep-diff.js";
import denialsRoutes from "./routes/denials.js";
import copilotRoutes from "./routes/copilot.js";
import extractRoutes from "./routes/extract.js";
import briefRoutes from "./routes/brief.js";
import eobRoutes from "./routes/eob.js";
import { ensureBucket } from "./lib/s3-init.js";
import timelineTool from "./tools/timeline.js";
import letterTool from "./tools/letter.js";
import smartAttachments from "./tools/smart-attachments.js";
import adminDeadlines from "./routes/admin/deadlines.js";
import internalEob from "./routes/internal/eob.js";
import translateTools from "./tools/translate.js";
import profileRoutes from "./routes/profile.js";
import icsRoutes from "./routes/ics.js";
import eligibilityRoutes from "./routes/eligibility.js";
import adminRules from "./routes/admin/rules.js";
import agentRoutes from "./routes/agent.js";
import nbsRoutes from "./routes/next-best-steps.js";
import adminUsage from "./routes/admin/usage.js";
import redact from "./mw/redact.js";
import auth from "./mw/auth.js";
import dbSession from "./mw/db-session.js";
import dsrRoutes from "./routes/dsr.js";
import billingRoutes from "./routes/billing.js";
import billingUi from "./routes/billing-ui.js";
import invitesRoutes from "./routes/invites.js";
import docUrlRoutes from "./routes/doc_urls.js";
import rbac from "./mw/rbac.js";
import jobsRoutes from "./routes/jobs.js";
import feedbackRoutes from "./routes/feedback.js";
import consentRoutes from "./routes/consent.js";

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    redact: {
      paths: ["req.headers.authorization", "body.password", "body.token", "headers.authorization"],
      remove: true,
    },
  },
});

await app.register(cors, { origin: (_origin, cb) => cb(null, true), credentials: true });
await app.register(jwt, { secret: process.env.JWT_SECRET || "dev-secret" });
await app.register(rateLimit, {
  max: 300,
  timeWindow: "1 minute",
  keyGenerator: (req: any) =>
    (req.headers["x-org-id"] as string) || (req.user?.org_id as string) || (req as any).orgId || req.ip,
});
await app.register(redact);
await app.register(auth);
await app.register(rbac);
await app.register(dbSession);

app.get("/health", async () => ({ ok: true }));

await app.register(documentsRoutes);
await app.register(childrenRoutes);
await app.register(askRoutes);
await app.register(iepDiffRoutes);
await app.register(denialsRoutes);
await app.register(copilotRoutes);
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
await app.register(jobsRoutes);
await app.register(feedbackRoutes);
await app.register(consentRoutes);

app.setErrorHandler((err: any, req, reply) => {
  if (err?.statusCode === 400 && /image data/i.test(String(err?.message))) {
    (req as any).log.error({ route: (req as any).raw?.url, bodyShape: typeof (req as any).body }, "OpenAI 400 invalid image input");
  }
  reply.send(err);
});

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
app
  .listen({ port, host })
  .then(() => {
    app.log.info(`API listening on http://${host}:${port}`);
    ensureBucket().catch((err) => app.log.warn({ err }, "ensureBucket failed"));
  })
  .catch((err) => {
    app.log.error(err, "Failed to start API");
    process.exit(1);
  });


