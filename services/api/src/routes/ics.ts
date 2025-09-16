import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { createEvent } from "ics";

export default async function routes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/deadlines/:id/ics", async (req, reply) => {
    const id = (req.params as any).id;
    const dl = await (prisma as any).deadlines.findUnique({ where: { id } });
    if (!dl) return reply.status(404).send({ error: "not found" });
    const start = new Date(dl.due_date);
    const event = createEvent({
      title: dl.kind,
      start: [start.getFullYear(), start.getMonth() + 1, start.getDate(), 9, 0],
      duration: { hours: 1 },
      description: `Deadline: ${dl.kind}`,
      calName: "Joslyn AI Deadlines",
    });
    if (event.error) return reply.status(500).send({ error: "ics error" });
    reply.header("Content-Type", "text/calendar");
    return reply.send(event.value);
  });
}


