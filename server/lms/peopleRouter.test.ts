import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

vi.mock("../db", () => ({ getDb: vi.fn(), publicUser: (user: unknown) => user }));

import { getDb } from "../db";
import { peopleRouter } from "./peopleRouter";

const mockedGetDb = vi.mocked(getDb);
const admin = { id: 3, openId: null, name: "School Admin", email: "admin@school.edu", loginMethod: null, username: "schooladmin", passwordHash: "hash", role: "ADMIN" as const, schoolId: 7, teacherId: null, status: "ACTIVE" as const, lastLogin: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
const teacher = { ...admin, id: 41, role: "TEACHER" as const };
const student = { ...admin, id: 81, role: "STUDENT" as const, teacherId: 41 };

function createDb(rows: unknown[]) {
  return {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => rows) })) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
  };
}

function context(user: typeof admin) {
  return { user, req: { headers: {}, ip: "127.0.0.1" }, res: {} } as unknown as TrpcContext;
}

describe("people edit routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates a teacher returned from the caller's school-scoped query", async () => {
    const db = createDb([teacher]);
    mockedGetDb.mockResolvedValue(db as never);
    const result = await peopleRouter.createCaller(context(admin)).admin.updateTeacher({ teacherId: 41, name: "Ada Lovelace" });
    expect(result.success).toBe(true);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("rejects a teacher ID not returned from the caller's school-scoped query", async () => {
    mockedGetDb.mockResolvedValue(createDb([]) as never);
    await expect(peopleRouter.createCaller(context(admin)).admin.updateTeacher({ teacherId: 99, name: "Outside School" })).rejects.toMatchObject<Partial<TRPCError>>({ code: "FORBIDDEN" });
  });

  it("rejects a returned teacher record from a different school as defense in depth", async () => {
    const db = createDb([{ ...teacher, schoolId: 8 }]);
    mockedGetDb.mockResolvedValue(db as never);
    await expect(peopleRouter.createCaller(context(admin)).admin.updateTeacher({ teacherId: 41, name: "Outside School" })).rejects.toMatchObject<Partial<TRPCError>>({ code: "FORBIDDEN" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates only a teacher-owned student returned from the scoped query", async () => {
    const db = createDb([student]);
    mockedGetDb.mockResolvedValue(db as never);
    const result = await peopleRouter.createCaller(context(teacher)).teacher.updateStudent({ studentId: 81, name: "Mira Patel", branch: "Computer Science" });
    expect(result.success).toBe(true);
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it("rejects an unowned student ID before any update occurs", async () => {
    const db = createDb([]);
    mockedGetDb.mockResolvedValue(db as never);
    await expect(peopleRouter.createCaller(context(teacher)).teacher.updateStudent({ studentId: 82, name: "Outside Student" })).rejects.toMatchObject<Partial<TRPCError>>({ code: "FORBIDDEN" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects a returned same-school student owned by a different teacher", async () => {
    const db = createDb([{ ...student, teacherId: 42 }]);
    mockedGetDb.mockResolvedValue(db as never);
    await expect(peopleRouter.createCaller(context(teacher)).teacher.updateStudent({ studentId: 81, name: "Not My Student" })).rejects.toMatchObject<Partial<TRPCError>>({ code: "FORBIDDEN" });
    expect(db.update).not.toHaveBeenCalled();
  });
});
