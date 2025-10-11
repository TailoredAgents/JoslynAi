import { FastifyInstance } from "fastify";
// Use untyped registration to avoid TS plugin wiring
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import websocket from "@fastify/websocket";
import { prisma } from "../lib/db.js";
import { orgIdFromRequest, resolveChildId } from "../lib/child.js";

export default async function routes(app: FastifyInstance) {
  await (app as any).register(websocket as any);
  (app as any).get("/realtime/:child_id", { websocket: true }, async (connection: any, req: any) => {
    const socket = connection.socket;
    try {
      await (req as any).jwtVerify();
    } catch {
      socket.close(1008, "unauthorized");
      return;
    }
    const orgId = orgIdFromRequest(req);
    const claimedOrg = (req as any).orgId || (req as any).user?.org_id || null;
    if (!claimedOrg || claimedOrg !== orgId) {
      socket.close(1008, "forbidden");
      return;
    }
    const rawChild = req.params?.child_id;
    const childId = await resolveChildId(rawChild, orgId);
    if (!childId) {
      socket.close(1008, "child_not_found");
      return;
    }

    socket.on("message", async (msg: any) => {
      try {
        const frame = JSON.parse(msg.toString());
        if (frame.type === "commitment") {
          await (prisma as any).tasks?.create?.({ data: { child_id: childId, title: frame.title, status: "open", created_at: new Date() } }).catch(() => {});
          socket.send(JSON.stringify({ type: "ack", ok: true }));
        } else if (frame.type === "deadline") {
          socket.send(JSON.stringify({ type: "ack", ok: true }));
        } else {
          socket.send(JSON.stringify({ type: "error", error: "unknown_frame" }));
        }
      } catch {
        socket.send(JSON.stringify({ type: "error", error: "invalid_frame" }));
      }
    });
  });
}

