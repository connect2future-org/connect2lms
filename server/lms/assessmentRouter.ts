import { randomInt } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assessmentAssignments, assessmentQuestions, assessments, attempts, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { requireRole } from "./guards";
import { generateHumanCode, requestAuditContext, writeAudit } from "./utils";

const optionSchema = z.object({ id: z.string().trim().min(1).max(72), text: z.string().trim().min(1).max(2000) });
const questionSchema = z.object({ questionText: z.string().trim().min(5).max(10000), options: z.array(optionSchema).min(2).max(8), correctOptionId: z.string().trim().min(1).max(72), marks: z.number().positive().max(100), negativeMarks: z.number().min(0).max(100) }).superRefine((question, context) => {
  if (!question.options.some(option => option.id === question.correctOptionId)) context.addIssue({ code: "custom", path: ["correctOptionId"], message: "Correct option must match an option ID." });
  if (new Set(question.options.map(option => option.id)).size !== question.options.length) context.addIssue({ code: "custom", path: ["options"], message: "Option IDs must be unique." });
});
const policySchema = z.object({ requireFullscreen: z.boolean().default(false), detectTabSwitch: z.boolean().default(true), detectWindowBlur: z.boolean().default(true), detectFullscreenExit: z.boolean().default(true), detectClipboard: z.boolean().default(true), detectContextMenu: z.boolean().default(true), detectShortcuts: z.boolean().default(true), violationThreshold: z.number().int().min(1).max(30).default(5), autoSubmitOnThreshold: z.boolean().default(false) });
const assessmentInput = z.object({ title: z.string().trim().min(3).max(220), description: z.string().trim().max(5000).optional(), startAt: z.date(), endAt: z.date(), durationMinutes: z.number().int().min(1).max(720), maxAttempts: z.number().int().min(1).max(10).default(1), accessCodeEnabled: z.boolean().default(true), accessCode: z.string().trim().min(5).max(32).optional(), randomizeQuestions: z.boolean().default(false), randomizeOptions: z.boolean().default(false), negativeMarking: z.boolean().default(false), antiCheat: policySchema, questions: z.array(questionSchema).min(1).max(100) }).superRefine((assessment, context) => {
  if (assessment.endAt <= assessment.startAt) context.addIssue({ code: "custom", path: ["endAt"], message: "End time must be later than start time." });
  if (assessment.durationMinutes * 60_000 > assessment.endAt.getTime() - assessment.startAt.getTime()) context.addIssue({ code: "custom", path: ["durationMinutes"], message: "Duration cannot exceed the scheduled window." });
});

function shuffled<T>(items: T[]) {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [output[index], output[swap]] = [output[swap]!, output[index]!];
  }
  return output;
}

export const assessmentRouter = router({
  teacherList: protectedProcedure.query(async ({ ctx }) => {
    const actor = requireRole(ctx.user, ["TEACHER"]);
    const db = await getDb();
    if (!db) return { success: true, message: "No database connection.", data: [] };
    const records = await db.select().from(assessments).where(and(eq(assessments.teacherId, actor.id), eq(assessments.schoolId, actor.schoolId!))).orderBy(desc(assessments.createdAt));
    return { success: true, message: "Assessments loaded.", data: records };
  }),
  create: protectedProcedure.input(assessmentInput).mutation(async ({ ctx, input }) => {
    const actor = requireRole(ctx.user, ["TEACHER"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
    const accessCode = input.accessCodeEnabled ? (input.accessCode?.toUpperCase() || generateHumanCode(input.title)) : null;
    if (accessCode) {
      const collision = await db.select({ id: assessments.id }).from(assessments).where(eq(assessments.accessCode, accessCode)).limit(1);
      if (collision[0]) throw new TRPCError({ code: "CONFLICT", message: "An assessment already uses that access code." });
    }
    await db.insert(assessments).values({ schoolId: actor.schoolId!, teacherId: actor.id, createdByUserId: actor.id, title: input.title, description: input.description ?? null, startAt: input.startAt, endAt: input.endAt, durationMinutes: input.durationMinutes, maxAttempts: input.maxAttempts, accessCode, accessCodeEnabled: input.accessCodeEnabled, randomizeQuestions: input.randomizeQuestions, randomizeOptions: input.randomizeOptions, negativeMarking: input.negativeMarking, antiCheat: input.antiCheat });
    const assessment = (await db.select().from(assessments).where(and(eq(assessments.teacherId, actor.id), eq(assessments.title, input.title))).orderBy(desc(assessments.id)).limit(1))[0];
    if (!assessment) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Assessment creation did not complete." });
    await db.insert(assessmentQuestions).values(input.questions.map((question, position) => ({ assessmentId: assessment.id, position: position + 1, type: "MCQ" as const, questionText: question.questionText, options: question.options, correctOptionId: question.correctOptionId, marks: String(question.marks), negativeMarks: input.negativeMarking ? String(question.negativeMarks) : "0.00", metadata: null })));
    await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "ASSESSMENT_CREATED", targetType: "ASSESSMENT", targetId: assessment.id, metadata: { questionCount: input.questions.length }, ...requestAuditContext(ctx.req) });
    return { success: true, message: "Validated MCQ assessment created as a draft.", data: assessment };
  }),
  update: protectedProcedure.input(z.object({ assessmentId: z.number().int().positive(), title: z.string().trim().min(3).max(220), description: z.string().trim().max(5000).optional(), startAt: z.date(), endAt: z.date(), durationMinutes: z.number().int().min(1).max(720), maxAttempts: z.number().int().min(1).max(10), randomizeQuestions: z.boolean(), randomizeOptions: z.boolean(), negativeMarking: z.boolean(), antiCheat: policySchema })).mutation(async ({ ctx, input }) => {
    const actor = requireRole(ctx.user, ["TEACHER"]);
    if (input.endAt <= input.startAt || input.durationMinutes * 60_000 > input.endAt.getTime() - input.startAt.getTime()) throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_SCHEDULE" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
    const assessment = (await db.select().from(assessments).where(and(eq(assessments.id, input.assessmentId), eq(assessments.teacherId, actor.id), eq(assessments.schoolId, actor.schoolId!))).limit(1))[0];
    if (!assessment || assessment.teacherId !== actor.id || assessment.schoolId !== actor.schoolId) throw new TRPCError({ code: "FORBIDDEN", message: "Assessment is outside your managed scope." });
    if (assessment.status !== "DRAFT") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "ASSESSMENT_NOT_EDITABLE" });
    await db.update(assessments).set({ title: input.title, description: input.description ?? null, startAt: input.startAt, endAt: input.endAt, durationMinutes: input.durationMinutes, maxAttempts: input.maxAttempts, randomizeQuestions: input.randomizeQuestions, randomizeOptions: input.randomizeOptions, negativeMarking: input.negativeMarking, antiCheat: input.antiCheat }).where(eq(assessments.id, assessment.id));
    await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "ASSESSMENT_UPDATED", targetType: "ASSESSMENT", targetId: assessment.id, ...requestAuditContext(ctx.req) });
    return { success: true, message: "Draft assessment updated.", data: { assessmentId: assessment.id } };
  }),
  publish: protectedProcedure.input(z.object({ assessmentId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const actor = requireRole(ctx.user, ["TEACHER"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
    const assessment = (await db.select().from(assessments).where(and(eq(assessments.id, input.assessmentId), eq(assessments.teacherId, actor.id), eq(assessments.schoolId, actor.schoolId!))).limit(1))[0];
    if (!assessment || assessment.teacherId !== actor.id || assessment.schoolId !== actor.schoolId) throw new TRPCError({ code: "FORBIDDEN", message: "Assessment is outside your managed scope." });
    const questionCount = (await db.select({ id: assessmentQuestions.id }).from(assessmentQuestions).where(eq(assessmentQuestions.assessmentId, assessment.id))).length;
    if (!questionCount) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "INVALID_QUESTION: an assessment must include at least one question." });
    await db.update(assessments).set({ status: "PUBLISHED" }).where(eq(assessments.id, assessment.id));
    await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "ASSESSMENT_PUBLISHED", targetType: "ASSESSMENT", targetId: assessment.id, ...requestAuditContext(ctx.req) });
    return { success: true, message: "Assessment published.", data: { assessmentId: assessment.id, status: "PUBLISHED", accessCode: assessment.accessCode } };
  }),
  setLifecycle: protectedProcedure.input(z.object({ assessmentId: z.number().int().positive(), action: z.enum(["UNPUBLISH", "ARCHIVE"]) })).mutation(async ({ ctx, input }) => {
    const actor = requireRole(ctx.user, ["TEACHER"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
    const assessment = (await db.select().from(assessments).where(and(eq(assessments.id, input.assessmentId), eq(assessments.teacherId, actor.id), eq(assessments.schoolId, actor.schoolId!))).limit(1))[0];
    if (!assessment || assessment.teacherId !== actor.id || assessment.schoolId !== actor.schoolId) throw new TRPCError({ code: "FORBIDDEN", message: "Assessment is outside your managed scope." });
    const status = input.action === "UNPUBLISH" ? "DRAFT" as const : "ARCHIVED" as const;
    await db.update(assessments).set({ status }).where(eq(assessments.id, assessment.id));
    await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: `ASSESSMENT_${input.action}`, targetType: "ASSESSMENT", targetId: assessment.id, ...requestAuditContext(ctx.req) });
    return { success: true, message: input.action === "UNPUBLISH" ? "Assessment returned to draft." : "Assessment archived.", data: { assessmentId: assessment.id, status } };
  }),
  manageAccessCode: protectedProcedure.input(z.object({ assessmentId: z.number().int().positive(), action: z.enum(["REGENERATE", "REVOKE", "ENABLE", "DISABLE"]) })).mutation(async ({ ctx, input }) => {
    const actor = requireRole(ctx.user, ["TEACHER"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
    const assessment = (await db.select().from(assessments).where(and(eq(assessments.id, input.assessmentId), eq(assessments.teacherId, actor.id), eq(assessments.schoolId, actor.schoolId!))).limit(1))[0];
    if (!assessment || assessment.teacherId !== actor.id || assessment.schoolId !== actor.schoolId) throw new TRPCError({ code: "FORBIDDEN", message: "Assessment is outside your managed scope." });
    if (input.action === "REGENERATE") {
      let accessCode = "";
      for (let index = 0; index < 6; index += 1) {
        const candidate = generateHumanCode(assessment.title);
        const collision = await db.select({ id: assessments.id }).from(assessments).where(eq(assessments.accessCode, candidate)).limit(1);
        if (!collision[0]) { accessCode = candidate; break; }
      }
      if (!accessCode) throw new TRPCError({ code: "CONFLICT", message: "Unable to generate a unique access code." });
      await db.update(assessments).set({ accessCode, accessCodeEnabled: true }).where(eq(assessments.id, assessment.id));
      await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "ASSESSMENT_CODE_REGENERATED", targetType: "ASSESSMENT", targetId: assessment.id, ...requestAuditContext(ctx.req) });
      return { success: true, message: "New access code generated.", data: { accessCode, accessCodeEnabled: true } };
    }
    const changes = input.action === "REVOKE" ? { accessCode: null, accessCodeEnabled: false } : { accessCodeEnabled: input.action === "ENABLE" };
    await db.update(assessments).set(changes).where(eq(assessments.id, assessment.id));
    await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: `ASSESSMENT_CODE_${input.action}`, targetType: "ASSESSMENT", targetId: assessment.id, ...requestAuditContext(ctx.req) });
    return { success: true, message: "Assessment access-code policy updated.", data: changes };
  }),
  assign: protectedProcedure.input(z.object({ assessmentId: z.number().int().positive(), studentIds: z.array(z.number().int().positive()).min(1).max(500) })).mutation(async ({ ctx, input }) => {
    const actor = requireRole(ctx.user, ["TEACHER"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
    const assessment = (await db.select().from(assessments).where(and(eq(assessments.id, input.assessmentId), eq(assessments.teacherId, actor.id), eq(assessments.schoolId, actor.schoolId!))).limit(1))[0];
    if (!assessment || assessment.teacherId !== actor.id || assessment.schoolId !== actor.schoolId) throw new TRPCError({ code: "FORBIDDEN", message: "Assessment is outside your managed scope." });
    const students = await db.select().from(users).where(and(inArray(users.id, input.studentIds), eq(users.role, "STUDENT"), eq(users.schoolId, actor.schoolId!), eq(users.teacherId, actor.id), eq(users.status, "ACTIVE")));
    if (students.length !== new Set(input.studentIds).size) throw new TRPCError({ code: "FORBIDDEN", message: "STUDENT_NOT_OWNED: one or more students are inactive or outside your managed scope." });
    let created = 0; let existing = 0;
    for (const student of students) {
      const present = await db.select({ id: assessmentAssignments.id }).from(assessmentAssignments).where(and(eq(assessmentAssignments.assessmentId, assessment.id), eq(assessmentAssignments.studentId, student.id))).limit(1);
      if (present[0]) { existing += 1; continue; }
      await db.insert(assessmentAssignments).values({ assessmentId: assessment.id, studentId: student.id, schoolId: actor.schoolId!, teacherId: actor.id, assignedByUserId: actor.id, status: "ASSIGNED" });
      created += 1;
    }
    await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "ASSESSMENT_ASSIGNED", targetType: "ASSESSMENT", targetId: assessment.id, metadata: { created, existing }, ...requestAuditContext(ctx.req) });
    return { success: true, message: "Student assignments processed.", data: { created, existing } };
  }),
  studentList: protectedProcedure.query(async ({ ctx }) => {
    const actor = requireRole(ctx.user, ["STUDENT"]);
    const db = await getDb();
    if (!db) return { success: true, message: "No database connection.", data: [] };
    const records = await db.select({ assessment: assessments, assignment: assessmentAssignments }).from(assessmentAssignments).innerJoin(assessments, eq(assessments.id, assessmentAssignments.assessmentId)).where(and(eq(assessmentAssignments.studentId, actor.id), eq(assessmentAssignments.schoolId, actor.schoolId!), eq(assessmentAssignments.status, "ASSIGNED"))).orderBy(desc(assessments.startAt));
    const now = new Date();
    return { success: true, message: "Assigned assessments loaded.", data: records.map(record => ({ id: record.assessment.id, title: record.assessment.title, description: record.assessment.description, startAt: record.assessment.startAt, endAt: record.assessment.endAt, durationMinutes: record.assessment.durationMinutes, accessCodeEnabled: record.assessment.accessCodeEnabled, status: record.assessment.endAt < now ? "EXPIRED" : record.assessment.startAt > now ? "UPCOMING" : "AVAILABLE" })) };
  }),
  studentQuestions: protectedProcedure.input(z.object({ assessmentId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const actor = requireRole(ctx.user, ["STUDENT"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
    const assignment = (await db.select().from(assessmentAssignments).where(and(eq(assessmentAssignments.assessmentId, input.assessmentId), eq(assessmentAssignments.studentId, actor.id), eq(assessmentAssignments.status, "ASSIGNED"))).limit(1))[0];
    if (!assignment || assignment.schoolId !== actor.schoolId) throw new TRPCError({ code: "FORBIDDEN", message: "NOT_ASSIGNED_TO_TEST" });
    const assessment = (await db.select().from(assessments).where(eq(assessments.id, input.assessmentId)).limit(1))[0];
    if (!assessment || assessment.schoolId !== actor.schoolId) throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
    const now = new Date();
    if (!["PUBLISHED", "ACTIVE"].includes(assessment.status)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "TEST_NOT_PUBLISHED" });
    if (assessment.startAt > now) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "TEST_NOT_STARTED" });
    if (assessment.endAt <= now) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "TEST_EXPIRED" });
    const questions = await db.select().from(assessmentQuestions).where(eq(assessmentQuestions.assessmentId, input.assessmentId));
    const sequence = assessment.randomizeQuestions ? shuffled(questions) : questions.sort((a, b) => a.position - b.position);
    return { success: true, message: "Student-safe questions loaded.", data: sequence.map(question => ({ id: question.id, position: question.position, type: question.type, questionText: question.questionText, marks: question.marks, options: assessment.randomizeOptions ? shuffled(question.options) : question.options })) };
  }),
  teacherResults: protectedProcedure.query(async ({ ctx }) => {
    const actor = requireRole(ctx.user, ["TEACHER"]);
    const db = await getDb();
    if (!db) return { success: true, message: "No database connection.", data: [] };
    const records = await db.select({ attempt: attempts, assessment: assessments, student: users }).from(attempts).innerJoin(assessments, eq(assessments.id, attempts.assessmentId)).innerJoin(users, eq(users.id, attempts.studentId)).where(and(eq(attempts.teacherId, actor.id), eq(attempts.schoolId, actor.schoolId!), eq(assessments.teacherId, actor.id), eq(assessments.schoolId, actor.schoolId!), eq(users.schoolId, actor.schoolId!), eq(users.teacherId, actor.id))).orderBy(desc(attempts.createdAt));
    return { success: true, message: "Teacher-scoped results loaded.", data: records.map(record => ({ attemptId: record.attempt.id, assessmentId: record.assessment.id, assessmentTitle: record.assessment.title, studentId: record.student.id, studentName: record.student.name, studentEmail: record.student.email, status: record.attempt.status, score: record.attempt.score, percentage: record.attempt.percentage, violationCount: record.attempt.violationCount, submittedAt: record.attempt.submittedAt })) };
  }),
});
