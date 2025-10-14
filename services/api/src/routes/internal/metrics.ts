import { FastifyInstance } from "fastify";
import { redis } from "../../lib/redis.js";
import { prisma } from "../../lib/db.js";
import { snapshotWebhookMetrics } from "../../lib/webhook-metrics.js";

const JOB_QUEUE = (process.env.JOB_QUEUE_NAME || "jobs").trim() || "jobs";
const DEAD_LETTER_QUEUE = (process.env.JOB_DEAD_LETTER_QUEUE || "jobs:dead").trim() || "jobs:dead";

export default async function routes(app: FastifyInstance) {
  const collectMetrics = async () => {
    const [queueLen, deadLen] = await Promise.all([
      redis.llen(JOB_QUEUE).catch(() => 0),
      redis.llen(DEAD_LETTER_QUEUE).catch(() => 0),
    ]);

    const statuses = ["pending", "processing", "done", "error"] as const;
    const counts = await Promise.all(
      statuses.map((status) =>
        prisma.job_runs.count({ where: { status } }).catch(() => 0),
      ),
    );

    const jobRuns = statuses.reduce<Record<string, number>>((acc, status, idx) => {
      acc[status] = counts[idx];
      return acc;
    }, {});

    return {
      queues: {
        [JOB_QUEUE]: queueLen,
        [DEAD_LETTER_QUEUE]: deadLen,
      },
      job_runs: jobRuns,
      webhooks: snapshotWebhookMetrics(),
    };
  };

  app.get("/internal/metrics/queues", async (_req, reply) => {
    const snapshot = await collectMetrics();
    return reply.send(snapshot);
  });

  app.get("/internal/metrics/prometheus", async (_req, reply) => {
    const snapshot = await collectMetrics();
    const lines: string[] = [];

    lines.push("# HELP joslyn_queue_depth Number of jobs in a queue.");
    lines.push("# TYPE joslyn_queue_depth gauge");
    for (const [queue, depth] of Object.entries(snapshot.queues)) {
      lines.push(`joslyn_queue_depth{queue="${queue}"} ${depth}`);
    }

    lines.push("# HELP joslyn_job_runs_total Count of job_run records by status.");
    lines.push("# TYPE joslyn_job_runs_total gauge");
    for (const [status, count] of Object.entries(snapshot.job_runs)) {
      lines.push(`joslyn_job_runs_total{status="${status}"} ${count}`);
    }

    lines.push("# HELP joslyn_webhook_events_total Stripe webhook outcomes aggregated by event type and result.");
    lines.push("# TYPE joslyn_webhook_events_total counter");
    for (const [key, count] of Object.entries(snapshot.webhooks)) {
      const dotIdx = key.lastIndexOf(".");
      const eventType = dotIdx >= 0 ? key.slice(0, dotIdx) : key;
      const outcome = dotIdx >= 0 ? key.slice(dotIdx + 1) : "unknown";
      lines.push(`joslyn_webhook_events_total{event="${eventType}",outcome="${outcome}"} ${count}`);
    }

    const body = `${lines.join("\n")}\n`;
    reply.header("content-type", "text/plain; version=0.0.4");
    return reply.send(body);
  });
}
