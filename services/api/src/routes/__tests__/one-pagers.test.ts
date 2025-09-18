import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockFindUnique = vi.fn();
const mockDocumentsFindFirst = vi.fn();
const mockShareCreate = vi.fn();
const mockEnqueue = vi.fn();
const mockResolveChildId = vi.fn(async (_childId: string) => _childId);
const mockOrgIdFromRequest = vi.fn(() => "org-123");

vi.mock("../../lib/db.js", () => ({
  prisma: {
    one_pagers: {
      findMany: mockFindMany,
      create: mockCreate,
      update: mockUpdate,
      findUnique: mockFindUnique,
    },
    documents: {
      findFirst: mockDocumentsFindFirst,
    },
    share_links: {
      create: mockShareCreate,
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

const mockToDataURL = vi.fn(async () => "data:image/png;base64,qr");
vi.mock("qrcode", () => ({ default: { toDataURL: mockToDataURL } }));

const importRoutes = () => import("../one-pagers.js");

describe("one-pagers routes", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockCreate.mockReset();
    mockUpdate.mockReset();
    mockFindUnique.mockReset();
    mockDocumentsFindFirst.mockReset();
    mockShareCreate.mockReset();
    mockEnqueue.mockReset();
    mockToDataURL.mockClear();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("lists one-pagers for a child", async () => {
    const fastify = Fastify();
    mockFindMany.mockResolvedValue([
      {
        id: "op-1",
        status: "ready",
        audience: "teacher",
        child_id: "child-1",
        language_primary: "en",
        language_secondary: "es",
        share_link_id: null,
        content_json: { title: "Snapshot" },
        citations_json: [],
        updated_at: "2025-09-17T00:00:00.000Z",
      },
    ]);

    const routes = (await importRoutes()).default;
    await routes(fastify as any);

    const response = await fastify.inject({ method: "GET", url: "/children/child-1/one-pagers" });
    expect(response.statusCode).toBe(200);
    expect(response.json().one_pagers).toHaveLength(1);
    await fastify.close();
  });

  it("creates and queues a one-pager", async () => {
    const fastify = Fastify();
    mockDocumentsFindFirst.mockResolvedValueOnce({ id: "doc-9" });
    mockCreate.mockResolvedValue({
      id: "op-2",
      status: "pending",
      audience: "teacher",
      child_id: "child-1",
      language_primary: "en",
      language_secondary: "es",
      share_link_id: null,
      content_json: {},
      citations_json: [],
      updated_at: new Date().toISOString(),
    });

    const routes = (await importRoutes()).default;
    await routes(fastify as any);

    const response = await fastify.inject({ method: "POST", url: "/children/child-1/one-pagers", payload: {} });
    expect(response.statusCode).toBe(200);
    expect(mockCreate).toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalledWith({
      kind: "build_one_pager",
      one_pager_id: "op-2",
      child_id: "child-1",
      org_id: "org-123",
      audience: "teacher",
      document_id: "doc-9",
      language_primary: "en",
      language_secondary: "es",
    });
    await fastify.close();
  });

  it("regenerates a one-pager", async () => {
    const fastify = Fastify();
    mockFindUnique.mockResolvedValue({
      id: "op-3",
      child_id: "child-1",
      audience: "teacher",
      org_id: "org-123",
      status: "ready",
      language_primary: "en",
      language_secondary: "es",
      content_json: { document_id: "doc-3" },
    });
    mockUpdate.mockResolvedValue({
      id: "op-3",
      child_id: "child-1",
      audience: "teacher",
      org_id: "org-123",
      status: "pending",
      language_primary: "en",
      language_secondary: "es",
      content_json: { document_id: "doc-3" },
    });

    const routes = (await importRoutes()).default;
    await routes(fastify as any);

    const response = await fastify.inject({ method: "POST", url: "/one-pagers/op-3/regenerate", payload: {} });
    expect(response.statusCode).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalledWith({
      kind: "build_one_pager",
      one_pager_id: "op-3",
      child_id: "child-1",
      org_id: "org-123",
      audience: "teacher",
      document_id: "doc-3",
      language_primary: "en",
      language_secondary: "es",
    });
    await fastify.close();
  });

  it("publishes a one-pager and returns share data", async () => {
    const fastify = Fastify();
    mockFindUnique.mockResolvedValueOnce({
      id: "op-4",
      child_id: "child-1",
      audience: "teacher",
      org_id: "org-123",
      status: "ready",
      language_primary: "en",
      language_secondary: "es",
      content_json: { title: "Snapshot" },
    });
    mockShareCreate.mockResolvedValue({ id: "share-1", token: "token123" });

    const routes = (await importRoutes()).default;
    await routes(fastify as any);

    const response = await fastify.inject({ method: "POST", url: "/one-pagers/op-4/publish", payload: {} });
    expect(response.statusCode).toBe(200);
    expect(mockShareCreate).toHaveBeenCalled();
    expect(mockToDataURL).toHaveBeenCalled();
    const body = response.json();
    expect(body.share_url).toContain('/share/');
    await fastify.close();
  });
});
