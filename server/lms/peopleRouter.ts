import bcrypt from "bcryptjs";
import { and, count, desc, eq, like, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assessmentAssignments, assessments, attempts, studentProfiles, users } from "../../drizzle/schema";
import { getDb, publicUser } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { requireRole } from "./guards";
import { normalizeIdentifier, requestAuditContext, writeAudit } from "./utils";

const personInput = z.object({ name: z.string().trim().min(2).max(180), email: z.string().trim().email().max(320), username: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9._-]+$/), temporaryPassword: z.string().min(12).max(128) });
const studentInput = personInput.extend({ studentId: z.string().trim().max(100).optional(), usn: z.string().trim().max(100).optional(), branch: z.string().trim().max(120).optional(), semester: z.string().trim().max(40).optional(), section: z.string().trim().max(40).optional(), className: z.string().trim().max(120).optional() });

async function assertUniqueIdentity(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, email: string, username: string) {
  const existing = await db.select({ id: users.id }).from(users).where(or(eq(users.email, normalizeIdentifier(email)), eq(users.username, username))).limit(1);
  if (existing[0]) throw new TRPCError({ code: "CONFLICT", message: "Email or username already exists." });
}

export const peopleRouter = router({
  admin: router({
    overview: protectedProcedure.query(async ({ ctx }) => {
      const actor = requireRole(ctx.user, ["ADMIN"]);
      const db = await getDb();
      if (!db) return { success: true, message: "No database connection.", data: { metrics: {}, teachers: [] } };
      const [teacherCount, studentCount, assessmentCount, attemptCount, teachers] = await Promise.all([
        db.select({ value: count() }).from(users).where(and(eq(users.schoolId, actor.schoolId!), eq(users.role, "TEACHER"))),
        db.select({ value: count() }).from(users).where(and(eq(users.schoolId, actor.schoolId!), eq(users.role, "STUDENT"))),
        db.select({ value: count() }).from(assessments).where(eq(assessments.schoolId, actor.schoolId!)),
        db.select({ value: count() }).from(attempts).where(eq(attempts.schoolId, actor.schoolId!)),
        db.select().from(users).where(and(eq(users.schoolId, actor.schoolId!), eq(users.role, "TEACHER"))).orderBy(desc(users.createdAt)),
      ]);
      return { success: true, message: "School overview loaded.", data: { metrics: { teachers: teacherCount[0]?.value ?? 0, students: studentCount[0]?.value ?? 0, assessments: assessmentCount[0]?.value ?? 0, attempts: attemptCount[0]?.value ?? 0 }, teachers: teachers.map(publicUser) } };
    }),
    createTeacher: protectedProcedure.input(personInput).mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["ADMIN"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
      await assertUniqueIdentity(db, input.email, input.username);
      const email = normalizeIdentifier(input.email);
      await db.insert(users).values({ name: input.name, email, username: input.username, passwordHash: await bcrypt.hash(input.temporaryPassword, 12), role: "TEACHER", schoolId: actor.schoolId!, status: "ACTIVE", lastSignedIn: new Date() });
      const teacher = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
      await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "TEACHER_CREATED", targetType: "USER", targetId: teacher?.id, ...requestAuditContext(ctx.req) });
      return { success: true, message: "Teacher created.", data: teacher ? publicUser(teacher) : null };
    }),
    listTeachers: protectedProcedure.input(z.object({ search: z.string().trim().max(120).optional() }).optional()).query(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["ADMIN"]);
      const db = await getDb();
      if (!db) return { success: true, message: "No database connection.", data: [] };
      const filters = [eq(users.schoolId, actor.schoolId!), eq(users.role, "TEACHER")];
      if (input?.search) filters.push(or(like(users.name, `%${input.search}%`), like(users.email, `%${input.search}%`))!);
      const records = await db.select().from(users).where(and(...filters)).orderBy(desc(users.createdAt));
      return { success: true, message: "Teachers loaded.", data: records.map(publicUser) };
    }),
    resetTeacherPassword: protectedProcedure.input(z.object({ teacherId: z.number().int().positive(), newPassword: z.string().min(12).max(128) })).mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["ADMIN"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
      const teacher = (await db.select().from(users).where(and(eq(users.id, input.teacherId), eq(users.schoolId, actor.schoolId!), eq(users.role, "TEACHER"))).limit(1))[0];
      if (!teacher) throw new TRPCError({ code: "FORBIDDEN", message: "Teacher is outside your school scope." });
      await db.update(users).set({ passwordHash: await bcrypt.hash(input.newPassword, 12) }).where(eq(users.id, teacher.id));
      await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "TEACHER_PASSWORD_RESET", targetType: "USER", targetId: teacher.id, ...requestAuditContext(ctx.req) });
      return { success: true, message: "Teacher password reset.", data: { teacherId: teacher.id } };
    }),
    setTeacherStatus: protectedProcedure.input(z.object({ teacherId: z.number().int().positive(), status: z.enum(["ACTIVE", "INACTIVE", "DISABLED"]) })).mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["ADMIN"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
      const teacher = (await db.select().from(users).where(and(eq(users.id, input.teacherId), eq(users.schoolId, actor.schoolId!), eq(users.role, "TEACHER"))).limit(1))[0];
      if (!teacher) throw new TRPCError({ code: "FORBIDDEN", message: "Teacher is outside your school scope." });
      await db.update(users).set({ status: input.status }).where(eq(users.id, teacher.id));
      await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: `TEACHER_${input.status}`, targetType: "USER", targetId: teacher.id, ...requestAuditContext(ctx.req) });
      return { success: true, message: "Teacher status updated.", data: { teacherId: teacher.id, status: input.status } };
    }),
    updateTeacher: protectedProcedure.input(z.object({ teacherId: z.number().int().positive(), name: z.string().trim().min(2).max(180) })).mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["ADMIN"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
      const teacher = (await db.select().from(users).where(and(eq(users.id, input.teacherId), eq(users.schoolId, actor.schoolId!), eq(users.role, "TEACHER"))).limit(1))[0];
      if (!teacher || teacher.schoolId !== actor.schoolId || teacher.role !== "TEACHER") throw new TRPCError({ code: "FORBIDDEN", message: "Teacher is outside your school scope." });
      await db.update(users).set({ name: input.name }).where(eq(users.id, teacher.id));
      await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "TEACHER_UPDATED", targetType: "USER", targetId: teacher.id, ...requestAuditContext(ctx.req) });
      return { success: true, message: "Teacher profile updated.", data: { teacherId: teacher.id, name: input.name } };
    }),
  }),
  teacher: router({
    overview: protectedProcedure.query(async ({ ctx }) => {
      const actor = requireRole(ctx.user, ["TEACHER"]);
      const db = await getDb();
      if (!db) return { success: true, message: "No database connection.", data: { metrics: {}, students: [] } };
      const [studentCount, assessmentCount, assignmentCount, attemptCount, students] = await Promise.all([
        db.select({ value: count() }).from(studentProfiles).where(eq(studentProfiles.teacherId, actor.id)),
        db.select({ value: count() }).from(assessments).where(and(eq(assessments.teacherId, actor.id), eq(assessments.schoolId, actor.schoolId!))),
        db.select({ value: count() }).from(assessmentAssignments).where(and(eq(assessmentAssignments.teacherId, actor.id), eq(assessmentAssignments.status, "ASSIGNED"))),
        db.select({ value: count() }).from(attempts).where(and(eq(attempts.teacherId, actor.id), eq(attempts.schoolId, actor.schoolId!))),
        db.select({ user: users, profile: studentProfiles }).from(studentProfiles).innerJoin(users, eq(users.id, studentProfiles.studentUserId)).where(and(eq(studentProfiles.teacherId, actor.id), eq(studentProfiles.schoolId, actor.schoolId!))).orderBy(desc(studentProfiles.createdAt)),
      ]);
      return { success: true, message: "Teacher overview loaded.", data: { metrics: { students: studentCount[0]?.value ?? 0, assessments: assessmentCount[0]?.value ?? 0, assignments: assignmentCount[0]?.value ?? 0, attempts: attemptCount[0]?.value ?? 0 }, students: students.map(record => ({ ...publicUser(record.user), profile: record.profile })) } };
    }),
    createStudent: protectedProcedure.input(studentInput).mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["TEACHER"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
      await assertUniqueIdentity(db, input.email, input.username);
      const email = normalizeIdentifier(input.email);
      await db.insert(users).values({ name: input.name, email, username: input.username, passwordHash: await bcrypt.hash(input.temporaryPassword, 12), role: "STUDENT", schoolId: actor.schoolId!, teacherId: actor.id, status: "ACTIVE", lastSignedIn: new Date() });
      const student = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
      if (!student) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Student identity could not be created." });
      await db.insert(studentProfiles).values({ studentUserId: student.id, schoolId: actor.schoolId!, teacherId: actor.id, studentId: input.studentId || null, usn: input.usn || null, branch: input.branch || null, semester: input.semester || null, section: input.section || null, className: input.className || null });
      await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "STUDENT_CREATED", targetType: "USER", targetId: student.id, ...requestAuditContext(ctx.req) });
      return { success: true, message: "Student created.", data: publicUser(student) };
    }),
    listStudents: protectedProcedure.input(z.object({ search: z.string().trim().max(120).optional() }).optional()).query(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["TEACHER"]);
      const db = await getDb();
      if (!db) return { success: true, message: "No database connection.", data: [] };
      const filters = [eq(studentProfiles.teacherId, actor.id), eq(studentProfiles.schoolId, actor.schoolId!)];
      if (input?.search) filters.push(or(like(users.name, `%${input.search}%`), like(users.email, `%${input.search}%`), like(studentProfiles.studentId, `%${input.search}%`))!);
      const records = await db.select({ user: users, profile: studentProfiles }).from(studentProfiles).innerJoin(users, eq(users.id, studentProfiles.studentUserId)).where(and(...filters)).orderBy(desc(studentProfiles.createdAt));
      return { success: true, message: "Students loaded.", data: records.map(record => ({ ...publicUser(record.user), profile: record.profile })) };
    }),
    resetStudentPassword: protectedProcedure.input(z.object({ studentId: z.number().int().positive(), newPassword: z.string().min(12).max(128) })).mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["TEACHER"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
      const student = (await db.select().from(users).where(and(eq(users.id, input.studentId), eq(users.role, "STUDENT"), eq(users.schoolId, actor.schoolId!), eq(users.teacherId, actor.id))).limit(1))[0];
      if (!student) throw new TRPCError({ code: "FORBIDDEN", message: "Student is outside your managed scope." });
      await db.update(users).set({ passwordHash: await bcrypt.hash(input.newPassword, 12) }).where(eq(users.id, student.id));
      await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "STUDENT_PASSWORD_RESET", targetType: "USER", targetId: student.id, ...requestAuditContext(ctx.req) });
      return { success: true, message: "Student password reset.", data: { studentId: student.id } };
    }),
    setStudentStatus: protectedProcedure.input(z.object({ studentId: z.number().int().positive(), status: z.enum(["ACTIVE", "INACTIVE", "DISABLED"]) })).mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["TEACHER"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
      const student = (await db.select().from(users).where(and(eq(users.id, input.studentId), eq(users.role, "STUDENT"), eq(users.schoolId, actor.schoolId!), eq(users.teacherId, actor.id))).limit(1))[0];
      if (!student) throw new TRPCError({ code: "FORBIDDEN", message: "Student is outside your managed scope." });
      await db.update(users).set({ status: input.status }).where(eq(users.id, student.id));
      await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: `STUDENT_${input.status}`, targetType: "USER", targetId: student.id, ...requestAuditContext(ctx.req) });
      return { success: true, message: "Student status updated.", data: { studentId: student.id, status: input.status } };
    }),
    updateStudent: protectedProcedure.input(z.object({ studentId: z.number().int().positive(), name: z.string().trim().min(2).max(180), branch: z.string().trim().max(120).optional(), semester: z.string().trim().max(40).optional(), section: z.string().trim().max(40).optional(), className: z.string().trim().max(120).optional() })).mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["TEACHER"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
      const student = (await db.select().from(users).where(and(eq(users.id, input.studentId), eq(users.role, "STUDENT"), eq(users.schoolId, actor.schoolId!), eq(users.teacherId, actor.id))).limit(1))[0];
      if (!student || student.schoolId !== actor.schoolId || student.teacherId !== actor.id || student.role !== "STUDENT") throw new TRPCError({ code: "FORBIDDEN", message: "Student is outside your managed scope." });
      await db.update(users).set({ name: input.name }).where(eq(users.id, student.id));
      await db.update(studentProfiles).set({ branch: input.branch || null, semester: input.semester || null, section: input.section || null, className: input.className || null }).where(and(eq(studentProfiles.studentUserId, student.id), eq(studentProfiles.teacherId, actor.id), eq(studentProfiles.schoolId, actor.schoolId!)));
      await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "STUDENT_UPDATED", targetType: "USER", targetId: student.id, ...requestAuditContext(ctx.req) });
      return { success: true, message: "Student profile updated.", data: { studentId: student.id, name: input.name } };
    }),
  }),
});
