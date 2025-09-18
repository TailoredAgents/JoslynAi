import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRecommendationsFindFirst = vi.fn();
const mockRecommendationsUpsert = vi.fn();
const mockDocumentsFindFirst = vi.fn();
const mockEnqueue = vi.fn();
const mockResolveChildId = vi.fn(async (_childId: string) => _childId);
const mockOrgIdFromRequest = vi.fn(() => "org-123");

vi.mock("../../lib/db.js", () => ({
  prisma: {
    recommendations: {
      findFirst: mockRecommendationsFindFirst,
      upsert: mockRecommendationsUpsert,
    },
    documents: {
      findFirst: mockDocumentsFindFirst,
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

describe("recommendations routes", () => {
  beforeEach(() => {
    mockRecommendationsFindFirst.mockReset();
    mockRecommendationsUpsert.mockReset();
    mockDocumentsFindFirst.mockReset();
    mockEnqueue.mockReset();
    mockResolveChildId.mockClear();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns missing status when no record", async () => {
    const fastify = Fastify();
    mockRecommendationsFindFirst.mockResolvedValue(null);
    const routes = (await import("../recommendations.js")).default;
    await routes(fastify as any);

    const response = await fastify.inject({
      method: "GET",
      url: "/children/child-1/recommendations",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toEqual({ status: "missing", record: null });
    await fastify.close();
  });

  it("returns serialized recommendation when present", async () => {
    const fastify = Fastify();
    const record = {
      id: "rec-1",
      status: "ready",
      source_kind: "auto",
      locale: "en",
      recommendations_json: [
        {
          id: "auto-1",
          recommendation: "Provide speech therapy",
          rationale: "Supports expressive language",
          citations: ["span-1"],
        },
      ],
      citations_json: [
        {
          span_id: "span-1",
          document_id: "doc-1",
          doc_name: "IEP",
          page: 3,
          snippet: "Speech supports",
        },
      ],
      updated_at: "2025-09-17T00:00:00.000Z",
    };
    mockRecommendationsFindFirst.mockResolvedValue(record);

    const routes = (await import("../recommendations.js")).default;
    await routes(fastify as any);

    const response = await fastify.inject({
      method: "GET",
      url: "/children/child-1/recommendations?source=auto",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ready",
      record: {
        id: "rec-1",
        status: "ready",
        source_kind: "auto",
        locale: "en",
        recommendations: record.recommendations_json,
        citations: record.citations_json,
        updated_at: "2025-09-17T00:00:00.000Z",
      },
    });
    await fastify.close();
  });

  it("queues regenerate request and upserts pending status", async () => {
    const fastify = Fastify();
    mockRecommendationsFindFirst.mockResolvedValue(null);
    mockDocumentsFindFirst.mockResolvedValue({ id: "doc-9" });
    const routes = (await import("../recommendations.js")).default;
    await routes(fastify as any);

    const response = await fastify.inject({
      method: "POST",
      url: "/children/child-1/recommendations/regenerate",
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, document_id: "doc-9", source: "auto" });
    expect(mockDocumentsFindFirst).toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalledWith({
      kind: "prep_recommendations",
      child_id: "child-1",
      org_id: "org-123",
      document_id: "doc-9",
      source: "auto",
    });
    expect(mockRecommendationsUpsert).toHaveBeenCalled();
    await fastify.close();
  });
});
