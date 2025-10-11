import { FastifyInstance } from "fastify";
// Use untyped registration to avoid TS plugin wiring
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import websocket from "@fastify/websocket";
import { prisma } from "../lib/db.js";
import { orgIdFromRequest, resolveChildId } from "../lib/child.js";

type CommitmentFrame = {
  type: "commitment";
  title: string;
  metadata?: Record<string, unknown>;
};

export function normalizeCommitmentFrame(input: unknown): CommitmentFrame | null {
  if (!input || typeof input !== "object") return null;
  const frame = input as Record<string, unknown>;
  if (frame.type !== "commitment") return null;
  const rawTitle = frame.title;
  if (typeof rawTitle !== "string") return null;
  const trimmed = rawTitle.trim();
  if (!trimmed) return null;
  const metadata = typeof frame.metadata === "object" && frame.metadata !== null ? (frame.metadata as Record<string, unknown>) : undefined;
  return { type: "commitment", title: trimmed.slice(0, 240), metadata };
}

export async function recordCommitmentTask(params: { childId: string; orgId: string | null; title: string; metadata?: Record<string, unknown> }) {
  const { childId, orgId, title, metadata } = params;
  if (!childId || !title) throw new Error("invalid_commitment");
  const existing = await (prisma as any).tasks?.findFirst?.({
    where: { child_id: childId, org_id: orgId, title },
    select: { id: true, status: true, metadata: true },
  });
  if (existing?.status === "completed") {
    return existing;
  }
  if (existing?.id) {
    return await (prisma as any).tasks.update({
      where: { id: existing.id },
      data: { status: "open", metadata: metadata ?? existing.metadata ?? null },
      select: { id: true, status: true },
    });
  }
  return await (prisma as any).tasks.create({
    data: {
      child_id: childId,
      org_id: orgId,
      title,
      status: "open",
      metadata: metadata ?? null,
    },
    select: { id: true, status: true },
  });
}

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
        const incoming = JSON.parse(msg.toString());
        if (incoming?.type === "commitment") {
          const frame = normalizeCommitmentFrame(incoming);
          if (!frame) {
            socket.send(JSON.stringify({ type: "error", error: "invalid_commitment" }));
            return;
          }
          try {
            const task = await recordCommitmentTask({ childId, orgId, title: frame.title, metadata: frame.metadata });
            socket.send(JSON.stringify({ type: "ack", ok: true, task_id: task.id }));
          } catch (err: any) {
            socket.send(JSON.stringify({ type: "error", error: "task_persist_failed", detail: err?.message ?? "failed_to_persist" }));
          }
          return;
        }
        if (incoming?.type === "deadline") {
          socket.send(JSON.stringify({ type: "ack", ok: true }));
          return;
        }
        socket.send(JSON.stringify({ type: "error", error: "unknown_frame" }));
      } catch (err: any) {
        socket.send(JSON.stringify({ type: "error", error: "invalid_frame", detail: err?.message ?? "parse_error" }));
      }
    });
  });
}
