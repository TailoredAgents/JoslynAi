import { FastifyInstance } from "fastify";
import { redis } from "../../lib/redis.js";
import { prisma } from "../../lib/db.js";

const JOB_QUEUE = (process.env.JOB_QUEUE_NAME || "jobs").trim() || "jobs";
const DEAD_LETTER_QUEUE = (process.env.JOB_DEAD_LETTER_QUEUE || "jobs:dead").trim() || "jobs:dead";

export default async function routes(app: FastifyInstance) {
  app.get("/internal/metrics/queues", async (_req, reply) => {
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

    return reply.send({
      queues: {
        [JOB_QUEUE]: queueLen,
        [DEAD_LETTER_QUEUE]: deadLen,
      },
      job_runs: statuses.reduce<Record<string, number>>((acc, status, idx) => {
        acc[status] = counts[idx];
        return acc;
      }, {}),
    });
  });
}
