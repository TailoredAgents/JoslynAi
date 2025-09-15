import Redis from "ioredis";
export const redis = new Redis(process.env.REDIS_URL!);

export async function enqueue(job: Record<string, any>) {
  await redis.rpush("jobs", JSON.stringify(job));
}


