import fastifyRawBody from "fastify-raw-body";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import documentsRoutes from "./routes/documents.js";
import childrenRoutes from "./routes/children.js";
import askRoutes from "./routes/ask.js";
import iepDiffRoutes from "./routes/iep-diff.js";
import denialsRoutes from "./routes/denials.js";
import appealsRoutes from "./routes/appeals.js";
import goalsRoutes from "./routes/goals.js";
import researchRoutes from "./routes/research.js";
import recommendationsRoutes from "./routes/recommendations.js";
import onePagersRoutes from "./routes/one-pagers.js";
import safetyRoutes from "./routes/safety.js";
import advocacyRoutes from "./routes/advocacy.js";
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
import internalJobs from "./routes/internal/jobs.js";
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
import realtimeRoutes from "./realtime/index.js";
import whoamiRoutes from "./routes/whoami.js";

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    redact: {
      paths: ["req.headers.authorization", "body.password", "body.token", "headers.authorization"],
      remove: true,
    },
  },
});

const rawJwtSecret = process.env.JWT_SECRET || process.env.API_JWT_SECRET;
// Enforce JWT secret presence in production
if ((process.env.NODE_ENV === "production") && !rawJwtSecret) {
  throw new Error("JWT_SECRET (or API_JWT_SECRET) is required in production");
}
if ((process.env.NODE_ENV === "production") && process.env.ALLOW_HEADER_AUTH === "1") {
  throw new Error("ALLOW_HEADER_AUTH=1 is not permitted in production");
}

await app.register(fastifyRawBody, {
  field: "rawBody",
  global: false,
  encoding: "utf8",
  runFirst: true,
});

// CORS: allow explicit origins via CORS_ORIGINS (comma-separated) or PUBLIC_BASE_URL; default open in dev
const rawAllowed = (process.env.CORS_ORIGINS || process.env.PUBLIC_BASE_URL || "").trim();
const allowedOrigins = rawAllowed ? rawAllowed.split(",").map((s) => s.trim()).filter(Boolean) : [];
await app.register(cors, {
  origin: (origin, cb) => {
    // allow non-browser clients or when no explicit allowlist is set
    if (!allowedOrigins.length || !origin) return cb(null, true);
    if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) return cb(null, true);
    try {
      const originUrl = new URL(origin).origin;
      const normalized = allowedOrigins.map((o) => {
        try { return new URL(o).origin; } catch { return o; }
      });
      if (normalized.includes(originUrl)) return cb(null, true);
    } catch {}
    return cb(null, false);
  },
  credentials: true,
});

const jwtSecret = rawJwtSecret || (process.env.NODE_ENV === "production" ? undefined as any : "dev-secret");
await app.register(jwt, { secret: jwtSecret });
await app.register(rateLimit, {
  max: 300,
  timeWindow: "1 minute",
  keyGenerator: (req: any) => {
    const uid = (req.user && (req.user as any).id) ? String((req.user as any).id) : null;
    return uid ? `uid:${uid}` : `ip:${req.ip}`;
  },
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
await app.register(appealsRoutes);
await app.register(goalsRoutes);
await app.register(researchRoutes);
await app.register(recommendationsRoutes);
await app.register(onePagersRoutes);
await app.register(safetyRoutes);
await app.register(advocacyRoutes);
await app.register(copilotRoutes);
await app.register(extractRoutes);
await app.register(briefRoutes);
await app.register(eobRoutes);
await app.register(timelineTool);
await app.register(letterTool);
await app.register(smartAttachments);
await app.register(adminDeadlines);
await app.register(internalEob);
await app.register(internalJobs);
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
await app.register(realtimeRoutes);
await app.register(feedbackRoutes);
await app.register(consentRoutes);
await app.register(whoamiRoutes);

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



