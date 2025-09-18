import { FastifyInstance } from "fastify";
import { FALLBACK_ORG_ID, isUuid } from "../lib/child.js";

export default async function auth(app: FastifyInstance) {
  app.addHook("preHandler", async (req) => {
    // Dev-friendly header-based auth
    const uid = (req.headers["x-user-id"] as string) || "demo-user";
    const email = (req.headers["x-user-email"] as string) || "demo@example.com";
    const rawOrg = ((req.headers["x-org-id"] as string) || "").trim();
    const org = isUuid(rawOrg) ? rawOrg : FALLBACK_ORG_ID;
    const role = (req.headers["x-user-role"] as string) || "owner";
    (req as any).user = { id: uid, email, org_id: org, role };
  });
}
