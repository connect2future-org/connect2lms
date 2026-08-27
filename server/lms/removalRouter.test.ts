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
  it("deactivates a teacher and their active students within the Admin school", async () => {
    const c = { users: { findOne: vi.fn().mockResolvedValue({ id: 21, role: "TEACHER" }), updateOne: vi.fn(), updateMany: vi.fn() } };
    mocks.getDb.mockResolvedValue({}); mocks.collections.mockReturnValue(c);
    await peopleRouter.createCaller(actor("ADMIN")).admin.deleteTeacher({ teacherId: 21 });
    expect(c.users.updateOne).toHaveBeenCalledWith({ id: 21 }, expect.objectContaining({ $set: expect.objectContaining({ status: "DISABLED" }) }));
    expect(c.users.updateMany).toHaveBeenCalledWith(expect.objectContaining({ schoolId: 7, teacherId: 21 }), expect.objectContaining({ $set: expect.objectContaining({ status: "DISABLED" }) }));
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

  it("revokes a managed student and their active assignments", async () => {
    const c = { users: { findOne: vi.fn().mockResolvedValue({ id: 31, role: "STUDENT" }), updateOne: vi.fn() }, assessmentAssignments: { updateMany: vi.fn() } };
    mocks.getDb.mockResolvedValue({}); mocks.collections.mockReturnValue(c);
    await peopleRouter.createCaller(actor("TEACHER")).teacher.deleteStudent({ studentId: 31 });
    expect(c.users.updateOne).toHaveBeenCalledWith({ id: 31 }, expect.objectContaining({ $set: expect.objectContaining({ status: "DISABLED" }) }));
    expect(c.assessmentAssignments.updateMany).toHaveBeenCalledWith(expect.objectContaining({ studentId: 31, schoolId: 7, status: "ASSIGNED" }), expect.objectContaining({ $set: expect.objectContaining({ status: "REVOKED" }) }));
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

  it("archives an institution and disables its active records", async () => {
    const c = { schools: { findOne: vi.fn().mockResolvedValue({ id: 7 }), updateOne: vi.fn() }, users: { updateMany: vi.fn() }, assessments: { updateMany: vi.fn() }, assessmentAssignments: { updateMany: vi.fn() } };
    mocks.getDb.mockResolvedValue({}); mocks.collections.mockReturnValue(c);
    await platformRouter.createCaller(actor("SUPER_ADMIN")).schools.remove({ schoolId: 7 });
    expect(c.schools.updateOne).toHaveBeenCalledWith({ id: 7 }, expect.objectContaining({ $set: expect.objectContaining({ status: "ARCHIVED" }) }));
    expect(c.users.updateMany).toHaveBeenCalledWith({ schoolId: 7 }, expect.anything());
    expect(c.assessments.updateMany).toHaveBeenCalledWith(expect.objectContaining({ schoolId: 7 }), expect.anything());
  });

  it("rejects institution archival for non-existent schools", async () => {
    const c = { schools: { findOne: vi.fn().mockResolvedValue(null) } };
    mocks.getDb.mockResolvedValue({}); mocks.collections.mockReturnValue(c);
    await expect(platformRouter.createCaller(actor("SUPER_ADMIN")).schools.remove({ schoolId: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
