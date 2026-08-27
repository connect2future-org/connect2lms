import { describe, expect, it } from "vitest";
import { requireRole, requireSameSchool, requireTeacherOwnership } from "./guards";
import type { LmsUser } from "./types";

const teacher: LmsUser = { id: 7, openId: null, name: "Teacher", email: "teacher@example.edu", loginMethod: "credentials", username: "teacher.7", passwordHash: "hash", role: "TEACHER", schoolId: 11, teacherId: null, status: "ACTIVE", lastLogin: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };

describe("institution-scoped people management guards", () => {
  it("allows an active teacher in their authorized role", () => { expect(requireRole(teacher, ["TEACHER"])).toBe(teacher); });
  it("rejects a cross-institution resource identifier", () => { expect(() => requireSameSchool(teacher, 12)).toThrow(/Cross-school/); });
  it("rejects resources owned by a different teacher", () => { expect(() => requireTeacherOwnership(teacher, 8)).toThrow(/different teacher/); });
  it("rejects an inactive institution account before any operation", () => { expect(() => requireRole({ ...teacher, status: "DISABLED" }, ["TEACHER"])).toThrow(/active institution scope/); });
});
