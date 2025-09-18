import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockFindUnique = vi.fn();
const mockDocumentsFindFirst = vi.fn();
const mockDocumentsFindUnique = vi.fn();
const mockEnqueue = vi.fn();
const mockResolveChildId = vi.fn(async (_childId: string) => _childId);
const mockOrgIdFromRequest = vi.fn(() => "org-123");

vi.mock("../../lib/db.js", () => ({
  prisma: {
    advocacy_outlines: {
      findMany: mockFindMany,
      create: mockCreate,
      update: mockUpdate,
      findUnique: mockFindUnique,
    },
    documents: {
      findFirst: mockDocumentsFindFirst,
      findUnique: mockDocumentsFindUnique,
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

const importRoutes = () => import("../advocacy.js");

describe("advocacy routes", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockCreate.mockReset();
    mockUpdate.mockReset();
    mockFindUnique.mockReset();
    mockDocumentsFindFirst.mockReset();
    mockDocumentsFindUnique.mockReset();
    mockEnqueue.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("lists outlines for a child", async () => {
    const fastify = Fastify();
    mockFindMany.mockResolvedValue([
      {
        id: "outline-1",
        outline_kind: "mediation",
        status: "ready",
        child_id: "child-1",
        outline_json: { summary: "Summary", facts: [], remedies: [] },
        citations_json: [],
        updated_at: "2025-09-17T00:00:00.000Z",
      },
    ]);

    const routes = (await importRoutes()).default;
    await routes(fastify as any);

    const response = await fastify.inject({
      method: "GET",
      url: "/children/child-1/advocacy/outlines",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().outlines).toHaveLength(1);
    await fastify.close();
  });

  it("creates outline and queues job", async () => {
    const fastify = Fastify();
    mockDocumentsFindFirst.mockResolvedValueOnce({ id: "doc-5" });
    mockCreate.mockResolvedValue({
      id: "outline-2",
      child_id: "child-1",
      outline_kind: "mediation",
      status: "pending",
      outline_json: { document_id: "doc-5" },
      citations_json: [],
      updated_at: new Date().toISOString(),
    });

    const routes = (await importRoutes()).default;
    await routes(fastify as any);

    const response = await fastify.inject({
      method: "POST",
      url: "/children/child-1/advocacy/outlines",
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(mockCreate).toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalledWith({
      kind: "build_advocacy_outline",
      outline_id: "outline-2",
      child_id: "child-1",
      org_id: "org-123",
      document_id: "doc-5",
      outline_kind: "mediation",
    });
    await fastify.close();
  });

  it("regenerates an existing outline", async () => {
    const fastify = Fastify();
    mockFindUnique.mockResolvedValue({
      id: "outline-3",
      child_id: "child-1",
      outline_kind: "mediation",
      status: "ready",
      outline_json: { document_id: "doc-7" },
      citations_json: [],
      updated_at: new Date().toISOString(),
    });
    mockUpdate.mockResolvedValue({
      id: "outline-3",
      child_id: "child-1",
      outline_kind: "mediation",
      status: "pending",
      outline_json: { document_id: "doc-7" },
      citations_json: [],
      updated_at: new Date().toISOString(),
    });

    const routes = (await importRoutes()).default;
    await routes(fastify as any);

    const response = await fastify.inject({
      method: "POST",
      url: "/advocacy/outlines/outline-3/regenerate",
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalledWith({
      kind: "build_advocacy_outline",
      outline_id: "outline-3",
      child_id: "child-1",
      org_id: "org-123",
      document_id: "doc-7",
      outline_kind: "mediation",
    });
    await fastify.close();
  });
});
