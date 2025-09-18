import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockQuery = vi.fn();
const mockDocumentsFindUnique = vi.fn();
const mockDocumentsFindFirst = vi.fn();
const mockResearchFindUnique = vi.fn();
const mockResearchUpsert = vi.fn();
const mockEnqueue = vi.fn();
const mockResolveChildId = vi.fn(async (_childId: string) => _childId);
const mockOrgIdFromRequest = vi.fn(() => "org-123");

vi.mock("../../lib/db.js", () => ({
  prisma: {
    $queryRawUnsafe: (...args: unknown[]) => mockQuery(...args),
    documents: {
      findUnique: mockDocumentsFindUnique,
      findFirst: mockDocumentsFindFirst,
    },
    research_summaries: {
      findUnique: mockResearchFindUnique,
      upsert: mockResearchUpsert,
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

const routesImport = () => import("../research.js");

describe("research routes", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockDocumentsFindUnique.mockReset();
    mockDocumentsFindFirst.mockReset();
    mockResearchFindUnique.mockReset();
    mockResearchUpsert.mockReset();
    mockEnqueue.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns summaries for child", async () => {
    const fastify = Fastify();
    mockQuery.mockResolvedValue([
      {
        id: "rs-1",
        status: "ready",
        document_id: "doc-1",
        doc_name: "Evaluation",
        doc_type: "eval_report",
        summary_json: { summary: "Summary text", teacher_voice: "Teacher", caregiver_voice: "Caregiver" },
        glossary_json: [{ term: "Term", definition: "Definition" }],
        citations_json: [
          { document_id: "doc-1", doc_name: "Evaluation", page: 2, snippet: "Snippet" },
        ],
        reading_level: "Grade 6",
        updated_at: "2025-09-17T00:00:00.000Z",
      },
    ]);

    const routes = (await routesImport()).default;
    await routes(fastify as any);

    const response = await fastify.inject({
      method: "GET",
      url: "/children/child-1/research",
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body.summaries)).toBe(true);
    expect(body.summaries[0]).toMatchObject({
      id: "rs-1",
      document_name: "Evaluation",
      reading_level: "Grade 6",
    });
    await fastify.close();
  });

  it("queues a research summary for a document", async () => {
    const fastify = Fastify();
    mockDocumentsFindUnique.mockResolvedValue({ id: "doc-2", child_id: "child-1", org_id: "org-123" });

    const routes = (await routesImport()).default;
    await routes(fastify as any);

    const response = await fastify.inject({
      method: "POST",
      url: "/documents/doc-2/explain",
    });

    expect(response.statusCode).toBe(200);
    expect(mockEnqueue).toHaveBeenCalledWith({
      kind: "research_summary",
      document_id: "doc-2",
      child_id: "child-1",
      org_id: "org-123",
    });
    expect(mockResearchUpsert).toHaveBeenCalled();
    await fastify.close();
  });

  it("returns missing when summary not found", async () => {
    const fastify = Fastify();
    mockDocumentsFindUnique.mockResolvedValue(null);

    const routes = (await routesImport()).default;
    await routes(fastify as any);

    const response = await fastify.inject({
      method: "GET",
      url: "/documents/doc-404/explain",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "missing", summary: null });
    await fastify.close();
  });
});
