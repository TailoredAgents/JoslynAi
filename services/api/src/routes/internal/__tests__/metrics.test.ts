import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redisLLen = vi.fn();

vi.mock("../../../lib/redis.js", () => ({
  redis: {
    llen: (...args: unknown[]) => redisLLen(...args),
  },
}));

const countMock = vi.fn();

vi.mock("../../../lib/db.js", () => ({
  prisma: {
    job_runs: {
      count: (...args: unknown[]) => countMock(...args),
    },
  },
}));

const importRoutes = () => import("../metrics.js");

describe("internal metrics", () => {
  beforeEach(() => {
    redisLLen.mockReset();
    countMock.mockReset();
    process.env.INTERNAL_API_KEY = "secret";
    process.env.JOB_QUEUE_NAME = "jobs";
    process.env.JOB_DEAD_LETTER_QUEUE = "jobs:dead";
  });

  it("returns queue lengths and job status counts", async () => {
    redisLLen.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    countMock
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2);

    const fastify = Fastify();
    (await importRoutes()).default(fastify);
    await fastify.ready();

    const res = await fastify.inject({
      method: "GET",
      url: "/internal/metrics/queues",
      headers: { "x-internal-key": "secret" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.queues).toEqual({ jobs: 5, "jobs:dead": 2 });
    expect(body.job_runs).toEqual({ pending: 3, processing: 1, done: 4, error: 2 });

    await fastify.close();
  });
});
