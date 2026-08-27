import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

vi.mock("../db", () => ({ getDb: vi.fn() }));
import { getDb } from "../db";
import { assessmentAssignments, assessmentQuestions, assessments, attempts } from "../../drizzle/schema";
import { attemptRouter, scoreAndClose } from "./attemptRouter";

const mockedGetDb = vi.mocked(getDb);
const now = new Date();
const student = { id: 81, openId: null, name: "Mira", email: "mira@school.edu", loginMethod: null, username: "mira", passwordHash: "hash", role: "STUDENT" as const, schoolId: 7, teacherId: 41, status: "ACTIVE" as const, lastLogin: null, createdAt: now, updatedAt: now, lastSignedIn: now };
const assessment = { id: 9, schoolId: 7, teacherId: 41, createdByUserId: 41, title: "Engineering Basics", description: null, startAt: new Date(Date.now() - 60_000), endAt: new Date(Date.now() + 3_600_000), durationMinutes: 30, maxAttempts: 1, accessCode: "ENG-123", accessCodeEnabled: true, randomizeQuestions: false, randomizeOptions: false, negativeMarking: false, antiCheat: { violationThreshold: 3, autoSubmitOnThreshold: true }, status: "PUBLISHED" as const, createdAt: now, updatedAt: now };
const assignment = { id: 5, assessmentId: 9, studentId: 81, schoolId: 7, teacherId: 41, assignedByUserId: 41, status: "ASSIGNED" as const, assignedAt: now, createdAt: now, updatedAt: now };
const question = { id: 101, assessmentId: 9, position: 1, type: "MCQ" as const, questionText: "Select the resilient design.", options: [{ id: "a", text: "One backup" }, { id: "b", text: "No fallback" }], correctOptionId: "a", marks: "2.00", negativeMarks: "0.00", metadata: null, createdAt: now };

function createDb(options: { assignmentRows?: unknown[]; activeRows?: unknown[]; countValue?: number; attemptRows?: unknown[]; questionRows?: unknown[] } = {}) {
  let attemptLookup = 0;
  const resolve = (table: unknown, fields: unknown) => {
    if (table === assessments) return [assessment];
    if (table === assessmentAssignments) return options.assignmentRows ?? [assignment];
    if (table === assessmentQuestions) return options.questionRows ?? [question];
    if (table === attempts && fields && typeof fields === "object" && "value" in fields) return [{ value: options.countValue ?? 0 }];
    if (table === attempts) return attemptLookup++ === 0 ? (options.activeRows ?? []) : (options.attemptRows ?? [{ id: 23 }]);
    return [];
  };
  const queryResult = (table: unknown, fields: unknown) => {
    const rows = resolve(table, fields);
    return Object.assign(Promise.resolve(rows), { limit: vi.fn(async () => rows), orderBy: vi.fn(() => ({ limit: vi.fn(async () => rows) })) });
  };
  return {
    select: vi.fn((fields?: unknown) => ({ from: vi.fn((table: unknown) => ({ where: vi.fn(() => queryResult(table, fields)) })) })),
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
  };
}
const context = { user: student, req: { headers: {}, ip: "127.0.0.1" }, res: {} } as unknown as TrpcContext;

describe("attempt authorization and closure", () => {
  beforeEach(() => vi.clearAllMocks());
  it("starts only an assigned student attempt with a valid access code", async () => {
    const db = createDb(); mockedGetDb.mockResolvedValue(db as never);
    const result = await attemptRouter.createCaller(context).start({ assessmentId: 9, accessCode: "ENG-123" });
    expect(result.success).toBe(true); expect(result.data.attemptId).toBe(23); expect(db.insert).toHaveBeenCalled();
  });
  it("rejects an unassigned student even when an assessment ID is known", async () => {
    mockedGetDb.mockResolvedValue(createDb({ assignmentRows: [] }) as never);
    await expect(attemptRouter.createCaller(context).start({ assessmentId: 9, accessCode: "ENG-123" })).rejects.toMatchObject<Partial<TRPCError>>({ code: "FORBIDDEN" });
  });
  it("rejects a duplicate active attempt before creating another record", async () => {
    const db = createDb({ activeRows: [{ id: 22 }], countValue: 1 }); mockedGetDb.mockResolvedValue(db as never);
    await expect(attemptRouter.createCaller(context).start({ assessmentId: 9, accessCode: "ENG-123" })).rejects.toMatchObject<Partial<TRPCError>>({ code: "CONFLICT" });
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("persists a backend-calculated score when closing an expired attempt", async () => {
    const db = createDb();
    const attempt = { id: 23, assessmentId: 9, studentId: 81, schoolId: 7, teacherId: 41, status: "IN_PROGRESS" as const, startedAt: now, expiresAt: new Date(Date.now() - 1), activeAttemptKey: "9:81", submittedAt: null, answers: { "101": "a" }, questionOrder: [101], optionOrder: { "101": ["a", "b"] }, score: "0.00", percentage: "0.00", violationCount: 0, createdAt: now, updatedAt: now };
    const result = await scoreAndClose(db as never, attempt, assessment, "EXPIRED");
    expect(result).toMatchObject({ score: 2, percentage: 100, status: "EXPIRED" }); expect(db.update).toHaveBeenCalledTimes(1);
  });
  it("scores and closes an expired attempt when autosave detects server expiry", async () => {
    const expiredAttempt = { id: 23, assessmentId: 9, studentId: 81, schoolId: 7, teacherId: 41, status: "IN_PROGRESS" as const, startedAt: now, expiresAt: new Date(Date.now() - 1), activeAttemptKey: "9:81", submittedAt: null, answers: { "101": "a" }, questionOrder: [101], optionOrder: { "101": ["a", "b"] }, score: "0.00", percentage: "0.00", violationCount: 0, createdAt: now, updatedAt: now };
    const db = createDb({ activeRows: [expiredAttempt] }); mockedGetDb.mockResolvedValue(db as never);
    await expect(attemptRouter.createCaller(context).saveAnswer({ attemptId: 23, questionId: 101, selectedOptionId: "a" })).rejects.toMatchObject<Partial<TRPCError>>({ code: "PRECONDITION_FAILED" });
    expect(db.update).toHaveBeenCalledTimes(1);
  });
  it("records a violation and auto-submits only through the server threshold mutation", async () => {
    const activeAttempt = { id: 23, assessmentId: 9, studentId: 81, schoolId: 7, teacherId: 41, status: "IN_PROGRESS" as const, startedAt: now, expiresAt: new Date(Date.now() + 60_000), activeAttemptKey: "9:81", submittedAt: null, answers: { "101": "a" }, questionOrder: [101], optionOrder: { "101": ["a", "b"] }, score: "0.00", percentage: "0.00", violationCount: 2, createdAt: now, updatedAt: now };
    const db = createDb({ activeRows: [activeAttempt] }); mockedGetDb.mockResolvedValue(db as never);
    const result = await attemptRouter.createCaller(context).recordViolation({ attemptId: 23, eventType: "TAB_HIDDEN" });
    expect(result.data).toMatchObject({ violationCount: 3, autoSubmitted: true, result: { status: "AUTO_SUBMITTED", score: 2 } });
    expect(db.update).toHaveBeenCalledTimes(2);
  });
});
