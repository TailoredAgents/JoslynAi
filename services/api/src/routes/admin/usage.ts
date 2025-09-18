import { FastifyInstance } from "fastify";
import { prisma } from "../../lib/db.js";

function parseDate(d?: string, def?: Date) {
  if (!d) return def;
  const x = new Date(d);
  return Number.isNaN(+x) ? def! : x;
}

export default async function routes(app: FastifyInstance) {
  app.addHook("onRequest", async (req, reply) => {
    const key = (req.headers["x-admin-api-key"] as string) || "";
    if (!key || key !== process.env.ADMIN_API_KEY) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.get("/admin/usage", async (req, reply) => {
    const q = (req.query as any) || {};
    const to = parseDate(q.to, new Date());
    const from = parseDate(q.from, new Date(Date.now() - 30 * 86400_000));
    const orgId = q.org_id || undefined;

    const whereTime: any = { gte: from, lte: to };
    const orgFilter = orgId ? { org_id: orgId } : {};

    const [agentRuns, lettersSent, deadlines, claims, eobs, notifications, events] = await Promise.all([
      (prisma as any).agent_runs.count({ where: { created_at: whereTime, ...orgFilter } }),
      (prisma as any).letters.count({ where: { status: "sent", sent_at: whereTime, ...orgFilter } }),
      (prisma as any).deadlines.count({ where: { created_at: whereTime, ...orgFilter } }),
      (prisma as any).claims.count({ where: { created_at: whereTime, ...orgFilter } }),
      (prisma as any).eobs.count({ where: { created_at: whereTime, ...orgFilter } }),
      (prisma as any).notifications.count({ where: { created_at: whereTime, ...orgFilter } }),
      (prisma as any).events.count({ where: { created_at: whereTime, ...orgFilter } }),
    ]);

    const costAgg = await (prisma as any).agent_runs.aggregate({
      _sum: { cost_cents: true, tokens: true },
      where: { created_at: whereTime, ...orgFilter },
    });

    const windowParams = orgId ? [from, to, orgId] : [from, to];

    const dailyAgentRuns = await ((prisma as any).$queryRawUnsafe(
      `
      SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS count
      FROM agent_runs
      WHERE created_at BETWEEN $1 AND $2
      ${orgId ? "AND org_id = $3" : ""}
      GROUP BY 1 ORDER BY 1 ASC
      `,
      ...windowParams
    )) as any as { day: string; count: number }[];

    const dailyLetters = await ((prisma as any).$queryRawUnsafe(
      `
      SELECT to_char(date_trunc('day', sent_at), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS count
      FROM letters
      WHERE status='sent' AND sent_at BETWEEN $1 AND $2
      ${orgId ? "AND org_id = $3" : ""}
      GROUP BY 1 ORDER BY 1 ASC
      `,
      ...windowParams
    )) as any as { day: string; count: number }[];

    const featureBreakdown = await ((prisma as any).$queryRawUnsafe(
      `
      SELECT type, COUNT(*)::int AS count
      FROM events
      WHERE created_at BETWEEN $1 AND $2
      ${orgId ? "AND org_id = $3" : ""}
      GROUP BY type
      ORDER BY count DESC
      `,
      ...windowParams
    )) as any as { type: string; count: number }[];

    return reply.send({
      window: { from, to },
      totals: {
        agent_runs: agentRuns,
        letters_sent: lettersSent,
        deadlines,
        claims,
        eobs,
        notifications,
        events,
        cost_cents: costAgg._sum?.cost_cents ?? 0,
        tokens: costAgg._sum?.tokens ?? 0,
      },
      daily: {
        agent_runs: dailyAgentRuns,
        letters_sent: dailyLetters,
      },
      features: featureBreakdown,
    });
  });
}
