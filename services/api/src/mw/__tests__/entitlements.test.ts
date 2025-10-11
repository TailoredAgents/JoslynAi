import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("../../lib/db.js", () => ({
  prisma: {
    entitlements: {
      findUnique,
      upsert: vi.fn(),
    },
  },
}));

const importMiddleware = () => import("../entitlements");

describe("requireEntitlement", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("fails closed when no entitlement record exists", async () => {
    const { requireEntitlement } = await importMiddleware();
    findUnique.mockResolvedValue(null);
    const reply: any = { sent: false, code: vi.fn().mockReturnThis(), send: vi.fn() };
    const result = await requireEntitlement({ orgId: "11111111-1111-4111-8111-111111111111" }, reply, "ask");
    expect(result).toBe(false);
    expect(reply.code).toHaveBeenCalledWith(402);
  });

  it("returns false when feature is disabled", async () => {
    const { requireEntitlement } = await importMiddleware();
    findUnique.mockResolvedValue({
      plan: "free",
      features_json: { ask: false },
    });
    const reply: any = { sent: false, code: vi.fn().mockReturnThis(), send: vi.fn() };
    const result = await requireEntitlement({ orgId: "11111111-1111-4111-8111-111111111111" }, reply, "ask");
    expect(result).toBe(false);
    expect(reply.code).toHaveBeenCalledWith(402);
  });

  it("permits feature when enabled", async () => {
    const { requireEntitlement } = await importMiddleware();
    findUnique.mockResolvedValue({
      plan: "free",
      features_json: { ask: true },
    });
    const reply: any = { sent: false, code: vi.fn().mockReturnThis(), send: vi.fn() };
    const result = await requireEntitlement({ orgId: "11111111-1111-4111-8111-111111111111" }, reply, "ask");
    expect(result).toBe(true);
    expect(reply.code).not.toHaveBeenCalled();
  });
});
