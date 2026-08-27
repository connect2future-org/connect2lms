import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import type { User } from "../../drizzle/schema";
import { requireRole, requireSameSchool, requireTeacherOwnership } from "./guards";

const teacher: User = {
  id: 41,
  openId: null,
  name: "Ada Teacher",
  email: "ada@north.example",
  loginMethod: null,
  username: "ada.teacher",
  passwordHash: "hashed",
  role: "TEACHER",
  schoolId: 7,
  teacherId: null,
  status: "ACTIVE",
  lastLogin: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

describe("LMS authorization guards", () => {
  it("accepts an active user only for their explicitly permitted role", () => {
    expect(requireRole(teacher, ["TEACHER"]).id).toBe(41);
    expect(() => requireRole(teacher, ["ADMIN"])).toThrow(TRPCError);
  });

  it("blocks all cross-school access for non-super-admin actors", () => {
    expect(() => requireSameSchool(teacher, 8)).toThrow(/Cross-school access/);
    expect(() => requireSameSchool(teacher, 7)).not.toThrow();
  });

  it("enforces teacher resource ownership even inside the same school", () => {
    expect(() => requireTeacherOwnership(teacher, 41)).not.toThrow();
    expect(() => requireTeacherOwnership(teacher, 42)).toThrow(/different teacher/);
  });
});
