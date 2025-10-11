import { describe, expect, it, vi, beforeEach } from "vitest";

const { tasksFindFirst, tasksCreate, tasksUpdate } = vi.hoisted(() => ({
  tasksFindFirst: vi.fn(),
  tasksCreate: vi.fn(),
  tasksUpdate: vi.fn(),
}));

vi.mock("../../lib/db.js", () => ({
  prisma: {
    tasks: {
      findFirst: tasksFindFirst,
      create: tasksCreate,
      update: tasksUpdate,
    },
  },
}));

const importRealtime = () => import("../index");

describe("normalizeCommitmentFrame", () => {
  it("returns commitment payload when valid", async () => {
    const { normalizeCommitmentFrame } = await importRealtime();
    const frame = normalizeCommitmentFrame({ type: "commitment", title: "  Meet teacher  " });
    expect(frame).toEqual({ type: "commitment", title: "Meet teacher" });
  });

  it("rejects invalid structures", async () => {
    const { normalizeCommitmentFrame } = await importRealtime();
    expect(normalizeCommitmentFrame(null)).toBeNull();
    expect(normalizeCommitmentFrame({ type: "commitment" })).toBeNull();
    expect(normalizeCommitmentFrame({ type: "other", title: "Test" })).toBeNull();
  });
});

describe("recordCommitmentTask", () => {
  beforeEach(() => {
    tasksFindFirst.mockReset();
    tasksCreate.mockReset();
    tasksUpdate.mockReset();
  });

  it("creates a task when none exists", async () => {
    const { recordCommitmentTask } = await importRealtime();
    tasksFindFirst.mockResolvedValue(null);
    tasksCreate.mockResolvedValue({ id: "t1", status: "open" });

    const result = await recordCommitmentTask({ childId: "child-1", orgId: "org-1", title: "Meet teacher" });

    expect(result).toEqual({ id: "t1", status: "open" });
    expect(tasksCreate).toHaveBeenCalledWith({
      data: {
        child_id: "child-1",
        org_id: "org-1",
        title: "Meet teacher",
        status: "open",
        metadata: null,
      },
      select: { id: true, status: true },
    });
  });

  it("re-opens an existing task when found", async () => {
    const { recordCommitmentTask } = await importRealtime();
    tasksFindFirst.mockResolvedValue({ id: "t1", status: "pending", metadata: { foo: "bar" } });
    tasksUpdate.mockResolvedValue({ id: "t1", status: "open" });

    const result = await recordCommitmentTask({ childId: "child-1", orgId: "org-1", title: "Meet teacher", metadata: { source: "copilot" } });

    expect(result).toEqual({ id: "t1", status: "open" });
    expect(tasksUpdate).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { status: "open", metadata: { source: "copilot" } },
      select: { id: true, status: true },
    });
  });

  it("returns existing completed task without changes", async () => {
    const { recordCommitmentTask } = await importRealtime();
    tasksFindFirst.mockResolvedValue({ id: "t1", status: "completed", metadata: null });

    const result = await recordCommitmentTask({ childId: "child-1", orgId: "org-1", title: "Meet teacher" });

    expect(result).toEqual({ id: "t1", status: "completed", metadata: null });
    expect(tasksCreate).not.toHaveBeenCalled();
    expect(tasksUpdate).not.toHaveBeenCalled();
  });
});
