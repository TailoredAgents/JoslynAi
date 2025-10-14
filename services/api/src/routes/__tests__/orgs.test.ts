import Fastify, { type FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { orgsUpsert, orgMembersUpsert, entitlementsUpsert } = vi.hoisted(() => ({
  orgsUpsert: vi.fn(),
  orgMembersUpsert: vi.fn(),
  entitlementsUpsert: vi.fn(),
}));

vi.mock("../../lib/db.js", () => ({
  prisma: {
    orgs: { upsert: orgsUpsert },
    org_members: { upsert: orgMembersUpsert },
    entitlements: { upsert: entitlementsUpsert },
  },
}));

const importRoutes = () => import("../orgs");

describe("POST /orgs/bootstrap", () => {
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "owner@example.com",
    org_id: "22222222-2222-4222-8222-222222222222",
  };
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    orgsUpsert.mockResolvedValue({ id: user.org_id, name: "Owner Org" });
    orgMembersUpsert.mockResolvedValue({ id: "member-1", role: "owner" });
    entitlementsUpsert.mockResolvedValue({});

    app = Fastify();
    app.addHook("preHandler", async (req: FastifyRequest) => {
      (req as any).user = user;
    });
    const routes = (await importRoutes()).default;
    await routes(app as any);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("creates org, membership, and entitlements", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/orgs/bootstrap",
      payload: { org_name: "My Family", role: "owner" },
    });

    expect(response.statusCode).toBe(200);
    expect(orgsUpsert).toHaveBeenCalledWith({
      where: { id: user.org_id },
      update: { name: "My Family" },
      create: { id: user.org_id, name: "My Family" },
      select: { id: true, name: true, created_at: true },
    });
    expect(orgMembersUpsert).toHaveBeenCalled();
    expect(entitlementsUpsert).toHaveBeenCalled();
  });
});
