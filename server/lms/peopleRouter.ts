import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { collections, nextId } from "../mongo";
import { getDb, publicUser } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { requireRole } from "./guards";
import { normalizeIdentifier, requestAuditContext, writeAudit } from "./utils";
import type { LmsUser, StudentProfile } from "./types";

const personInput = z.object({ name: z.string().trim().min(2).max(180), email: z.string().trim().email().max(320), username: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9._-]+$/), temporaryPassword: z.string().min(12).max(128) });
const studentInput = personInput.extend({ studentId: z.string().trim().max(100).optional(), usn: z.string().trim().max(100).optional(), branch: z.string().trim().max(120).optional(), semester: z.string().trim().max(40).optional(), section: z.string().trim().max(40).optional(), className: z.string().trim().max(120).optional() });

async function assertUniqueIdentity(db: Awaited<ReturnType<typeof getDb>>, schoolId: number, email: string, username: string) { const existing = await collections(db).users.findOne({ schoolId, $or: [{ email: normalizeIdentifier(email) }, { username }] }, { projection: { _id: 1 } }); if (existing) throw new TRPCError({ code: "CONFLICT", message: "Email or username already exists in this institution." }); }

/** Fully purge a single student: user account, profile, assignments, attempts, and remove from all tables. */
async function purgeStudentById(db: Awaited<ReturnType<typeof getDb>>, schoolId: number, studentId: number) {
  const c = collections(db);
  await Promise.all([
    c.users.deleteOne({ id: studentId }),
    c.studentProfiles.deleteMany({ studentUserId: studentId }),
    c.assessmentAssignments.deleteMany({ studentId, schoolId }),
    c.attempts.deleteMany({ studentId, schoolId }),
    c.studentTables.updateMany({ schoolId }, { $pull: { studentUserIds: studentId } }),
  ]);
}

/** Fully purge a teacher and ALL data mapped to them: students, assessments, assignments, attempts, tables, import batches. */
async function purgeTeacherById(db: Awaited<ReturnType<typeof getDb>>, schoolId: number, teacherId: number) {
  const c = collections(db);
  const studentProfiles = await c.studentProfiles.find({ schoolId, teacherId }).toArray();
  const studentIds = studentProfiles.map(p => p.studentUserId);
  await Promise.all(studentIds.map(sid => purgeStudentById(db, schoolId, sid)));
  const assessments = await c.assessments.find({ schoolId, teacherId }).toArray();
  const assessmentIds = assessments.map(a => a.id);
  await Promise.all([
    c.assessments.deleteMany({ schoolId, teacherId }),
    assessmentIds.length ? c.assessmentAssignments.deleteMany({ assessmentId: { $in: assessmentIds }, schoolId }) : Promise.resolve(),
    assessmentIds.length ? c.attempts.deleteMany({ assessmentId: { $in: assessmentIds }, schoolId }) : Promise.resolve(),
    c.studentTables.deleteMany({ schoolId, teacherId }),
    c.importBatches.deleteMany({ schoolId, teacherId }),
    c.users.deleteOne({ id: teacherId }),
  ]);
}

export const peopleRouter = router({
  admin: router({
    overview: protectedProcedure.query(async ({ ctx }) => { const actor = requireRole(ctx.user, ["ADMIN"]); const db = await getDb(); const c = collections(db); const scope = { schoolId: actor.schoolId! }; const [teacherCount, studentCount, assessmentCount, attemptCount, teachers] = await Promise.all([c.users.countDocuments({ ...scope, role: "TEACHER" }), c.users.countDocuments({ ...scope, role: "STUDENT" }), c.assessments.countDocuments(scope), c.attempts.countDocuments(scope), c.users.find({ ...scope, role: "TEACHER" }).sort({ createdAt: -1 }).toArray()]); return { success: true, message: "School overview loaded.", data: { metrics: { teachers: teacherCount, students: studentCount, assessments: assessmentCount, attempts: attemptCount }, teachers: teachers.map(u => ({ ...publicUser(u), initialPassword: (u as any).initialPassword ?? null })) } }; }),
    createTeacher: protectedProcedure.input(personInput).mutation(async ({ ctx, input }) => { const actor = requireRole(ctx.user, ["ADMIN"]); const db = await getDb(); const c = collections(db); await assertUniqueIdentity(db, actor.schoolId!, input.email, input.username); const now = new Date(); const teacher: LmsUser & { initialPassword?: string } = { id: await nextId(db, "users"), openId: null, name: input.name, email: normalizeIdentifier(input.email), loginMethod: "credentials", username: input.username, passwordHash: await bcrypt.hash(input.temporaryPassword, 12), initialPassword: input.temporaryPassword, role: "TEACHER", schoolId: actor.schoolId!, teacherId: null, status: "ACTIVE", lastLogin: null, createdAt: now, updatedAt: now, lastSignedIn: now }; await c.users.insertOne(teacher as any); await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "TEACHER_CREATED", targetType: "USER", targetId: teacher.id, ...requestAuditContext(ctx.req) }); return { success: true, message: "Teacher created.", data: publicUser(teacher) }; }),
    listTeachers: protectedProcedure.input(z.object({ search: z.string().trim().max(120).optional() }).optional()).query(async ({ ctx, input }) => { const actor = requireRole(ctx.user, ["ADMIN"]); const filter: Record<string, unknown> = { schoolId: actor.schoolId!, role: "TEACHER" }; if (input?.search) filter.$or = [{ name: { $regex: input.search, $options: "i" } }, { email: { $regex: input.search, $options: "i" } }]; const records = await collections(await getDb()).users.find(filter).sort({ createdAt: -1 }).toArray(); return { success: true, message: "Teachers loaded.", data: records.map(publicUser) }; }),
    resetTeacherPassword: protectedProcedure.input(z.object({ teacherId: z.number().int().positive(), newPassword: z.string().min(12).max(128) })).mutation(async ({ ctx, input }) => { const actor = requireRole(ctx.user, ["ADMIN"]); const db = await getDb(); const c = collections(db); const teacher = await c.users.findOne({ id: input.teacherId, schoolId: actor.schoolId!, role: "TEACHER" }); if (!teacher) throw new TRPCError({ code: "FORBIDDEN", message: "Teacher is outside your school scope." }); await c.users.updateOne({ id: teacher.id }, { $set: { passwordHash: await bcrypt.hash(input.newPassword, 12), updatedAt: new Date() } }); await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "TEACHER_PASSWORD_RESET", targetType: "USER", targetId: teacher.id, ...requestAuditContext(ctx.req) }); return { success: true, message: "Teacher password reset.", data: { teacherId: teacher.id } }; }),
    setTeacherStatus: protectedProcedure.input(z.object({ teacherId: z.number().int().positive(), status: z.enum(["ACTIVE", "INACTIVE", "DISABLED"]) })).mutation(async ({ ctx, input }) => { const actor = requireRole(ctx.user, ["ADMIN"]); const db = await getDb(); const c = collections(db); const teacher = await c.users.findOne({ id: input.teacherId, schoolId: actor.schoolId!, role: "TEACHER" }); if (!teacher) throw new TRPCError({ code: "FORBIDDEN", message: "Teacher is outside your school scope." }); await c.users.updateOne({ id: teacher.id }, { $set: { status: input.status, updatedAt: new Date() } }); await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: `TEACHER_${input.status}`, targetType: "USER", targetId: teacher.id, ...requestAuditContext(ctx.req) }); return { success: true, message: "Teacher status updated.", data: { teacherId: teacher.id, status: input.status } }; }),
    updateTeacher: protectedProcedure.input(z.object({ teacherId: z.number().int().positive(), name: z.string().trim().min(2).max(180) })).mutation(async ({ ctx, input }) => { const actor = requireRole(ctx.user, ["ADMIN"]); const db = await getDb(); const c = collections(db); const teacher = await c.users.findOne({ id: input.teacherId, schoolId: actor.schoolId!, role: "TEACHER" }); if (!teacher) throw new TRPCError({ code: "FORBIDDEN", message: "Teacher is outside your school scope." }); await c.users.updateOne({ id: teacher.id }, { $set: { name: input.name, updatedAt: new Date() } }); await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "TEACHER_UPDATED", targetType: "USER", targetId: teacher.id, ...requestAuditContext(ctx.req) }); return { success: true, message: "Teacher profile updated.", data: { teacherId: teacher.id, name: input.name } }; }),
    // Hard-purges teacher + all students, tests, tables, attempts, assignments mapped to them
    deleteTeacher: protectedProcedure.input(z.object({ teacherId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["ADMIN"]);
      const db = await getDb();
      const c = collections(db);
      const teacher = await c.users.findOne({ id: input.teacherId, schoolId: actor.schoolId!, role: "TEACHER" });
      if (!teacher) throw new TRPCError({ code: "FORBIDDEN", message: "Teacher is outside your school scope." });
      await purgeTeacherById(db, actor.schoolId!, input.teacherId);
      await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "TEACHER_PURGED", targetType: "USER", targetId: input.teacherId, metadata: { purgedAllStudentsAndData: true }, ...requestAuditContext(ctx.req) });
      return { success: true, message: "Teacher and all mapped student, test, and table data permanently deleted.", data: { teacherId: input.teacherId } };
    }),
  }),
  teacher: router({
    overview: protectedProcedure.query(async ({ ctx }) => { const actor = requireRole(ctx.user, ["TEACHER"]); const db = await getDb(); const c = collections(db); const scope = { schoolId: actor.schoolId!, teacherId: actor.id }; const [studentCount, assessmentCount, assignmentCount, attemptCount, profiles] = await Promise.all([c.studentProfiles.countDocuments(scope), c.assessments.countDocuments(scope), c.assessmentAssignments.countDocuments({ ...scope, status: "ASSIGNED" }), c.attempts.countDocuments(scope), c.studentProfiles.find(scope).sort({ createdAt: -1 }).toArray()]); const users = profiles.length ? await c.users.find({ id: { $in: profiles.map(profile => profile.studentUserId) } }).toArray() : []; const byId = new Map(users.map(user => [user.id, user])); const students = profiles.flatMap(profile => { const user = byId.get(profile.studentUserId); return user ? [{ ...publicUser(user), profile }] : []; }); return { success: true, message: "Teacher overview loaded.", data: { metrics: { students: studentCount, assessments: assessmentCount, assignments: assignmentCount, attempts: attemptCount }, students } }; }),
    createStudent: protectedProcedure.input(studentInput).mutation(async ({ ctx, input }) => { const actor = requireRole(ctx.user, ["TEACHER"]); const db = await getDb(); const c = collections(db); await assertUniqueIdentity(db, actor.schoolId!, input.email, input.username); const now = new Date(); const rawPassword = (input.usn || input.studentId || input.temporaryPassword).trim(); const defaultPassword = rawPassword.length >= 6 ? rawPassword : input.temporaryPassword; const student: LmsUser = { id: await nextId(db, "users"), openId: null, name: input.name, email: normalizeIdentifier(input.email), loginMethod: "credentials", username: input.username, passwordHash: await bcrypt.hash(defaultPassword, 12), role: "STUDENT", schoolId: actor.schoolId!, teacherId: actor.id, status: "ACTIVE", lastLogin: null, createdAt: now, updatedAt: now, lastSignedIn: now }; const profile: StudentProfile = { id: await nextId(db, "studentProfiles"), studentUserId: student.id, schoolId: actor.schoolId!, teacherId: actor.id, importBatchId: null, studentId: input.studentId || null, usn: input.usn || null, branch: input.branch || null, semester: input.semester || null, section: input.section || null, className: input.className || null, createdAt: now, updatedAt: now }; await c.users.insertOne(student); await c.studentProfiles.insertOne(profile); await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "STUDENT_CREATED", targetType: "USER", targetId: student.id, ...requestAuditContext(ctx.req) }); return { success: true, message: "Student created.", data: publicUser(student) }; }),
    listStudents: protectedProcedure.input(z.object({ search: z.string().trim().max(120).optional() }).optional()).query(async ({ ctx, input }) => { const actor = requireRole(ctx.user, ["TEACHER"]); const db = await getDb(); const c = collections(db); const profiles = await c.studentProfiles.find({ schoolId: actor.schoolId!, teacherId: actor.id, ...(input?.search ? { $or: [{ studentId: { $regex: input.search, $options: "i" } }, { usn: { $regex: input.search, $options: "i" } }] } : {}) }).sort({ createdAt: -1 }).toArray(); const users = profiles.length ? await c.users.find({ id: { $in: profiles.map(profile => profile.studentUserId) } }).toArray() : []; const byId = new Map(users.map(user => [user.id, user])); return { success: true, message: "Students loaded.", data: profiles.flatMap(profile => { const user = byId.get(profile.studentUserId); return user && (!input?.search || [user.name, user.email, profile.studentId, profile.usn].some(value => String(value ?? "").toLowerCase().includes(input.search!.toLowerCase()))) ? [{ ...publicUser(user), profile }] : []; }) }; }),
    resetStudentPassword: protectedProcedure.input(z.object({ studentId: z.number().int().positive(), newPassword: z.string().min(8).max(128) })).mutation(async ({ ctx, input }) => { const actor = requireRole(ctx.user, ["TEACHER"]); const db = await getDb(); const c = collections(db); const student = await c.users.findOne({ id: input.studentId, role: "STUDENT", schoolId: actor.schoolId! }); if (!student) throw new TRPCError({ code: "FORBIDDEN", message: "Student is outside your managed scope." }); await c.users.updateOne({ id: student.id }, { $set: { passwordHash: await bcrypt.hash(input.newPassword, 12), updatedAt: new Date() } }); await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "STUDENT_PASSWORD_RESET", targetType: "USER", targetId: student.id, ...requestAuditContext(ctx.req) }); return { success: true, message: "Student password reset.", data: { studentId: student.id } }; }),
    setStudentStatus: protectedProcedure.input(z.object({ studentId: z.number().int().positive(), status: z.enum(["ACTIVE", "INACTIVE", "DISABLED"]) })).mutation(async ({ ctx, input }) => { const actor = requireRole(ctx.user, ["TEACHER"]); const db = await getDb(); const c = collections(db); const student = await c.users.findOne({ id: input.studentId, role: "STUDENT", schoolId: actor.schoolId! }); if (!student) throw new TRPCError({ code: "FORBIDDEN", message: "Student is outside your managed scope." }); await c.users.updateOne({ id: student.id }, { $set: { status: input.status, updatedAt: new Date() } }); await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: `STUDENT_${input.status}`, targetType: "USER", targetId: student.id, ...requestAuditContext(ctx.req) }); return { success: true, message: "Student status updated.", data: { studentId: student.id, status: input.status } }; }),
    updateStudent: protectedProcedure.input(z.object({ studentId: z.number().int().positive(), name: z.string().trim().min(2).max(180), usn: z.string().trim().max(100).optional(), studentCode: z.string().trim().max(100).optional(), branch: z.string().trim().max(120).optional(), semester: z.string().trim().max(40).optional(), section: z.string().trim().max(40).optional(), className: z.string().trim().max(120).optional() })).mutation(async ({ ctx, input }) => { const actor = requireRole(ctx.user, ["TEACHER"]); const db = await getDb(); const c = collections(db); const student = await c.users.findOne({ id: input.studentId, role: "STUDENT", schoolId: actor.schoolId! }); if (!student) throw new TRPCError({ code: "FORBIDDEN", message: "Student is outside your managed scope." }); await c.users.updateOne({ id: student.id }, { $set: { name: input.name, updatedAt: new Date() } }); await c.studentProfiles.updateOne({ studentUserId: student.id, schoolId: actor.schoolId! }, { $set: { usn: input.usn ?? null, studentId: input.studentCode ?? null, branch: input.branch ?? null, semester: input.semester ?? null, section: input.section ?? null, className: input.className ?? null, updatedAt: new Date() } }); await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "STUDENT_UPDATED", targetType: "USER", targetId: student.id, ...requestAuditContext(ctx.req) }); return { success: true, message: "Student profile updated.", data: { studentId: student.id, name: input.name } }; }),
    // Hard-purges student: user account, profile, credentials, assignments, attempts, table memberships
    deleteStudent: protectedProcedure.input(z.object({ studentId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["TEACHER"]);
      const db = await getDb();
      const c = collections(db);
      const student = await c.users.findOne({ id: input.studentId, role: "STUDENT", schoolId: actor.schoolId! });
      if (!student) throw new TRPCError({ code: "FORBIDDEN", message: "Student is outside your managed scope." });
      await purgeStudentById(db, actor.schoolId!, input.studentId);
      await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "STUDENT_PURGED", targetType: "USER", targetId: input.studentId, ...requestAuditContext(ctx.req) });
      return { success: true, message: "Student account, profile, credentials, assignments, and results permanently deleted.", data: { studentId: input.studentId } };
    }),
    // Legacy alias — same full purge as deleteStudent
    purgeStudent: protectedProcedure.input(z.object({ studentId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["TEACHER"]);
      const db = await getDb();
      const c = collections(db);
      const student = await c.users.findOne({ id: input.studentId, role: "STUDENT", schoolId: actor.schoolId! });
      if (!student) throw new TRPCError({ code: "FORBIDDEN", message: "Student is outside your managed scope." });
      await purgeStudentById(db, actor.schoolId!, input.studentId);
      await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "STUDENT_PURGED", targetType: "USER", targetId: input.studentId, ...requestAuditContext(ctx.req) });
      return { success: true, message: "Student record permanently deleted.", data: { studentId: input.studentId } };
    }),
  }),
});
