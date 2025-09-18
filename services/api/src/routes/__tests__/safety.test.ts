import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.fn();
const mockEnqueue = vi.fn();
const mockResolveChildId = vi.fn(async (childId: string) => childId);
const mockOrgIdFromRequest = vi.fn(() => "org-123");

vi.mock("../../lib/db.js", () => ({
  prisma: {
    safety_phrases: {
      findMany: mockFindMany,
    },
  },
}));

vi.mock("../../lib/child.js", () => ({
  resolveChildId: mockResolveChildId,
  orgIdFromRequest: mockOrgIdFromRequest,
}));

vi.mock("../../lib/redis.js", () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
}));

const routesImport = () => import("../safety.js");

describe("safety phrases routes", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockEnqueue.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns phrases for a child", async () => {
    const fastify = Fastify();
    mockFindMany.mockResolvedValue([
      {
        id: "phrase-1",
        status: "active",
        tag: "minutes_down",
        org_id: "org-123",
        contexts: ["minutes", "reduction"],
        content_json: { phrase_en: "Phrase", phrase_es: "Frase" },
        updated_at: "2025-09-17T00:00:00.000Z",
      },
    ]);

    const routes = (await routesImport()).default;
    await routes(fastify as any);

    const response = await fastify.inject({ method: "GET", url: "/children/child-1/safety/phrases?tag=minutes_down" });
    expect(response.statusCode).toBe(200);
    expect(response.json().phrases).toHaveLength(1);
    await fastify.close();
  });

  it("queues generation when requested", async () => {
    const fastify = Fastify();
    const routes = (await routesImport()).default;
    await routes(fastify as any);

    const response = await fastify.inject({
      method: "POST",
      url: "/children/child-1/safety/phrases",
      payload: { tag: "minutes_down", contexts: ["minutes", "reduced"] },
    });

    expect(response.statusCode).toBe(200);
    expect(mockEnqueue).toHaveBeenCalledWith({
      kind: "generate_safety_phrase",
      child_id: "child-1",
      org_id: "org-123",
      tag: "minutes_down",
      contexts: ["minutes", "reduced"],
    });
    await fastify.close();
  });
});
