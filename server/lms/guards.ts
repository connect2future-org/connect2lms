import { TRPCError } from "@trpc/server";
import type { LmsRole, User } from "../../drizzle/schema";

export type AuthenticatedActor = User;

export function requireRole(actor: User | null, allowed: readonly LmsRole[]): AuthenticatedActor {
  if (!actor) throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication is required." });
  if (!allowed.includes(actor.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your role is not permitted to perform this operation." });
  }
  if (actor.role !== "SUPER_ADMIN" && (!actor.schoolId || actor.status !== "ACTIVE")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your account does not have an active institution scope." });
  }
  return actor;
}

export function requireSameSchool(actor: AuthenticatedActor, schoolId: number) {
  if (actor.role !== "SUPER_ADMIN" && actor.schoolId !== schoolId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Cross-school access is not allowed." });
  }
}

export function requireTeacherOwnership(actor: AuthenticatedActor, teacherId: number) {
  if (actor.role !== "TEACHER" || actor.id !== teacherId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This resource belongs to a different teacher." });
  }
}
