import { FastifyInstance } from "fastify";
// Use untyped registration to avoid TS plugin wiring
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import websocket from "@fastify/websocket";
import { prisma } from "../lib/db.js";

export default async function routes(app: FastifyInstance) {
  await (app as any).register(websocket as any);
  (app as any).get("/realtime/:child_id", { websocket: true }, async (connection: any, req: any) => {
    const child_id = req.params?.child_id;
    connection.socket.on("message", async (msg: any) => {
      try {
        const frame = JSON.parse(msg.toString());
        if (frame.type === "commitment") {
          await (prisma as any).tasks?.create?.({ data: { child_id, title: frame.title, status: "open", created_at: new Date() } }).catch(() => {});
          connection.socket.send(JSON.stringify({ type: "ack", ok: true }));
        } else if (frame.type === "deadline") {
          connection.socket.send(JSON.stringify({ type: "ack", ok: true }));
        }
      } catch {}
    });
  });
}

