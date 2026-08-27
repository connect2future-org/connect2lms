import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

vi.mock("../db", () => ({ getDb: vi.fn() }));
import { getDb } from "../db";
import { assessmentQuestions, assessments } from "../../drizzle/schema";
import { assessmentRouter } from "./assessmentRouter";

const mockedGetDb = vi.mocked(getDb);
const now = new Date();
const teacher = { id: 41, openId: null, name: "Ada", email: "ada@school.edu", loginMethod: null, username: "ada", passwordHash: "hash", role: "TEACHER" as const, schoolId: 7, teacherId: null, status: "ACTIVE" as const, lastLogin: null, createdAt: now, updatedAt: now, lastSignedIn: now };
const draft = { id: 9, schoolId: 7, teacherId: 41, createdByUserId: 41, title: "Engineering Basics", description: null, startAt: new Date(Date.now() + 60_000), endAt: new Date(Date.now() + 3_600_000), durationMinutes: 30, maxAttempts: 1, accessCode: "ENG-123", accessCodeEnabled: true, randomizeQuestions: false, randomizeOptions: false, negativeMarking: false, antiCheat: {}, status: "DRAFT" as const, createdAt: now, updatedAt: now };

function createDb(questionRows: unknown[]) {
  const query = (table: unknown) => Object.assign(Promise.resolve(table === assessments ? [draft] : table === assessmentQuestions ? questionRows : []), { limit: vi.fn(async () => table === assessments ? [draft] : questionRows) });
  return { select: vi.fn(() => ({ from: vi.fn((table: unknown) => ({ where: vi.fn(() => query(table)) })) })), update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })), insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
}
const ctx = { user: teacher, req: { headers: {}, ip: "127.0.0.1" }, res: {} } as unknown as TrpcContext;

describe("assessment publication", () => {
  beforeEach(() => vi.clearAllMocks());
  it("publishes a teacher-owned draft with persisted question content", async () => {
    const db = createDb([{ id: 101 }]); mockedGetDb.mockResolvedValue(db as never);
    const result = await assessmentRouter.createCaller(ctx).publish({ assessmentId: 9 });
    expect(result.data.status).toBe("PUBLISHED"); expect(db.update).toHaveBeenCalledTimes(1);
  });
  it("rejects publication when an owned draft has no questions", async () => {
    mockedGetDb.mockResolvedValue(createDb([]) as never);
    await expect(assessmentRouter.createCaller(ctx).publish({ assessmentId: 9 })).rejects.toMatchObject<Partial<TRPCError>>({ code: "PRECONDITION_FAILED" });
  });
  it("allows an owner to edit a draft and archive it through explicit lifecycle actions", async () => {
    const db = createDb([{ id: 101 }]); mockedGetDb.mockResolvedValue(db as never);
    const edited = await assessmentRouter.createCaller(ctx).update({ assessmentId: 9, title: "Engineering Basics v2", startAt: new Date(Date.now() + 60_000), endAt: new Date(Date.now() + 3_600_000), durationMinutes: 30, maxAttempts: 1, randomizeQuestions: true, randomizeOptions: true, negativeMarking: true, antiCheat: { violationThreshold: 3, autoSubmitOnThreshold: true } });
    expect(edited.success).toBe(true);
    const archived = await assessmentRouter.createCaller(ctx).setLifecycle({ assessmentId: 9, action: "ARCHIVE" });
    expect(archived.data.status).toBe("ARCHIVED");
  });
  it("returns an owned published assessment to draft through the explicit unpublish action", async () => {
    const db = createDb([{ id: 101 }]); mockedGetDb.mockResolvedValue(db as never);
    const result = await assessmentRouter.createCaller(ctx).setLifecycle({ assessmentId: 9, action: "UNPUBLISH" });
    expect(result).toMatchObject({ data: { assessmentId: 9, status: "DRAFT" }, message: "Assessment returned to draft." });
  });
  it("allows an owner to disable an access-code requirement without accepting client scope", async () => {
    const db = createDb([{ id: 101 }]); mockedGetDb.mockResolvedValue(db as never);
    const result = await assessmentRouter.createCaller(ctx).manageAccessCode({ assessmentId: 9, action: "DISABLE" });
    expect(result.data).toEqual({ accessCodeEnabled: false });
  });
  it("supports enabling and revoking an owned assessment code", async () => {
    const db = createDb([{ id: 101 }]); mockedGetDb.mockResolvedValue(db as never);
    expect((await assessmentRouter.createCaller(ctx).manageAccessCode({ assessmentId: 9, action: "ENABLE" })).data).toEqual({ accessCodeEnabled: true });
    expect((await assessmentRouter.createCaller(ctx).manageAccessCode({ assessmentId: 9, action: "REVOKE" })).data).toEqual({ accessCode: null, accessCodeEnabled: false });
  });
  it("regenerates a code only after a collision-free lookup", async () => {
    let assessmentLookups = 0;
    const query = (table: unknown) => { const rows = table === assessments ? (assessmentLookups++ === 0 ? [draft] : []) : []; return Object.assign(Promise.resolve(rows), { limit: vi.fn(async () => rows) }); };
    const db = { select: vi.fn(() => ({ from: vi.fn((table: unknown) => ({ where: vi.fn(() => query(table)) })) })), update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })), insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    mockedGetDb.mockResolvedValue(db as never);
    const result = await assessmentRouter.createCaller(ctx).manageAccessCode({ assessmentId: 9, action: "REGENERATE" });
    expect(result.data.accessCode).toMatch(/^ENGINE-[A-Z0-9]+$/);
    expect(result.data.accessCodeEnabled).toBe(true);
  });
});
