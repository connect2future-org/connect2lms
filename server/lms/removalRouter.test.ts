import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collections: vi.fn(),
  getDb: vi.fn(),
  writeAudit: vi.fn(),
  requestAuditContext: vi.fn(() => ({})),
}));

vi.mock("../mongo", () => ({ collections: mocks.collections, nextId: vi.fn() }));
vi.mock("../db", () => ({ getDb: mocks.getDb, publicUser: (user: unknown) => user }));
vi.mock("./utils", () => ({ writeAudit: mocks.writeAudit, requestAuditContext: mocks.requestAuditContext }));

const { peopleRouter } = await import("./peopleRouter");
const { assessmentRouter } = await import("./assessmentRouter");
const { platformRouter } = await import("./platformRouter");

const actor = (role: "ADMIN" | "TEACHER" | "SUPER_ADMIN") => ({ user: { id: 10, role, schoolId: role === "SUPER_ADMIN" ? null : 7, teacherId: null, status: "ACTIVE" }, req: { headers: {}, protocol: "https" }, res: {} });

afterEach(() => { vi.clearAllMocks(); });

describe("scoped removal procedures", () => {
  it("hard-purges a teacher and all their mapped data within the Admin school", async () => {
    const c = {
      users: { findOne: vi.fn().mockResolvedValue({ id: 21, role: "TEACHER" }), deleteOne: vi.fn(), deleteMany: vi.fn() },
      studentProfiles: { find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }), deleteMany: vi.fn() },
      assessments: { find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }), deleteMany: vi.fn() },
      assessmentAssignments: { deleteMany: vi.fn() },
      attempts: { deleteMany: vi.fn() },
      studentTables: { deleteMany: vi.fn(), updateMany: vi.fn() },
      importBatches: { deleteMany: vi.fn() },
    };
    mocks.getDb.mockResolvedValue({}); mocks.collections.mockReturnValue(c);
    await peopleRouter.createCaller(actor("ADMIN")).admin.deleteTeacher({ teacherId: 21 });
    expect(c.users.deleteOne).toHaveBeenCalledWith({ id: 21 });
    expect(c.studentTables.deleteMany).toHaveBeenCalledWith({ schoolId: 7, teacherId: 21 });
  });

  it("rejects teacher deletion outside the Admin school scope", async () => {
    const c = { users: { findOne: vi.fn().mockResolvedValue(null) } };
    mocks.getDb.mockResolvedValue({}); mocks.collections.mockReturnValue(c);
    await expect(peopleRouter.createCaller(actor("ADMIN")).admin.deleteTeacher({ teacherId: 999 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects student deletion outside the Teacher managed scope", async () => {
    const c = { users: { findOne: vi.fn().mockResolvedValue(null) } };
    mocks.getDb.mockResolvedValue({}); mocks.collections.mockReturnValue(c);
    await expect(peopleRouter.createCaller(actor("TEACHER")).teacher.deleteStudent({ studentId: 999 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("hard-purges a student: deletes user, profile, assignments, attempts, and table memberships", async () => {
    const c = {
      users: { findOne: vi.fn().mockResolvedValue({ id: 31, role: "STUDENT" }), deleteOne: vi.fn() },
      studentProfiles: { deleteMany: vi.fn() },
      assessmentAssignments: { deleteMany: vi.fn() },
      attempts: { deleteMany: vi.fn() },
      studentTables: { updateMany: vi.fn() },
    };
    mocks.getDb.mockResolvedValue({}); mocks.collections.mockReturnValue(c);
    await peopleRouter.createCaller(actor("TEACHER")).teacher.deleteStudent({ studentId: 31 });
    expect(c.users.deleteOne).toHaveBeenCalledWith({ id: 31 });
    expect(c.studentProfiles.deleteMany).toHaveBeenCalledWith({ studentUserId: 31 });
    expect(c.assessmentAssignments.deleteMany).toHaveBeenCalledWith({ studentId: 31, schoolId: 7 });
    expect(c.attempts.deleteMany).toHaveBeenCalledWith({ studentId: 31, schoolId: 7 });
    expect(c.studentTables.updateMany).toHaveBeenCalledWith({ schoolId: 7 }, { $pull: { studentUserIds: 31 } });
  });

  it("hard-deletes a draft assessment but archives a published assessment", async () => {
    const c = { assessments: { findOne: vi.fn().mockResolvedValue({ id: 41, status: "DRAFT" }), deleteOne: vi.fn(), updateOne: vi.fn() }, assessmentQuestions: { deleteMany: vi.fn() }, assessmentAssignments: { deleteMany: vi.fn() } };
    mocks.getDb.mockResolvedValue({}); mocks.collections.mockReturnValue(c);
    await assessmentRouter.createCaller(actor("TEACHER")).remove({ assessmentId: 41 });
    expect(c.assessments.deleteOne).toHaveBeenCalled();
    c.assessments.findOne.mockResolvedValue({ id: 42, status: "PUBLISHED" });
    await assessmentRouter.createCaller(actor("TEACHER")).remove({ assessmentId: 42 });
    expect(c.assessments.updateOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ status: "ARCHIVED" }) }));
  });

  it("rejects assessment removal outside the Teacher managed scope", async () => {
    const c = { assessments: { findOne: vi.fn().mockResolvedValue(null) } };
    mocks.getDb.mockResolvedValue({}); mocks.collections.mockReturnValue(c);
    await expect(assessmentRouter.createCaller(actor("TEACHER")).remove({ assessmentId: 999 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("hard-deletes an institution and ALL its data", async () => {
    const c = {
      schools: { findOne: vi.fn().mockResolvedValue({ id: 7, name: "Test School" }), deleteOne: vi.fn() },
      users: { deleteMany: vi.fn() },
      studentProfiles: { deleteMany: vi.fn() },
      assessments: { deleteMany: vi.fn() },
      assessmentAssignments: { deleteMany: vi.fn() },
      attempts: { deleteMany: vi.fn() },
      studentTables: { deleteMany: vi.fn() },
      importBatches: { deleteMany: vi.fn() },
    };
    mocks.getDb.mockResolvedValue({}); mocks.collections.mockReturnValue(c);
    await platformRouter.createCaller(actor("SUPER_ADMIN")).schools.remove({ schoolId: 7 });
    expect(c.schools.deleteOne).toHaveBeenCalledWith({ id: 7 });
    expect(c.users.deleteMany).toHaveBeenCalledWith({ schoolId: 7 });
    expect(c.assessments.deleteMany).toHaveBeenCalledWith({ schoolId: 7 });
    expect(c.studentProfiles.deleteMany).toHaveBeenCalledWith({ schoolId: 7 });
    expect(c.attempts.deleteMany).toHaveBeenCalledWith({ schoolId: 7 });
  });

  it("rejects institution deletion for non-existent schools", async () => {
    const c = { schools: { findOne: vi.fn().mockResolvedValue(null) } };
    mocks.getDb.mockResolvedValue({}); mocks.collections.mockReturnValue(c);
    await expect(platformRouter.createCaller(actor("SUPER_ADMIN")).schools.remove({ schoolId: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
