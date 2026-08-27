import { randomInt } from "node:crypto";
import { and, count, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assessmentAssignments, assessmentQuestions, assessments, attempts, integrityViolations } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { calculateExpiresAt, calculateScore, isExpired, shouldAutoSubmit } from "./assessment";
import { requireRole } from "./guards";
import { requestAuditContext, writeAudit } from "./utils";

const eventType = z.enum(["TAB_HIDDEN", "WINDOW_BLUR", "FULLSCREEN_EXIT", "COPY", "PASTE", "CUT", "CONTEXT_MENU", "SHORTCUT"]);

function secureShuffle<T>(items: T[]) {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [output[index], output[swap]] = [output[swap]!, output[index]!];
  }
  return output;
}

export async function scoreAndClose(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, attempt: typeof attempts.$inferSelect, assessment: typeof assessments.$inferSelect, status: "SUBMITTED" | "AUTO_SUBMITTED" | "EXPIRED") {
  const questions = await db.select().from(assessmentQuestions).where(eq(assessmentQuestions.assessmentId, assessment.id));
  const result = calculateScore(questions.map(question => ({ id: question.id, correctOptionId: question.correctOptionId, marks: question.marks, negativeMarks: question.negativeMarks })), attempt.answers, assessment.negativeMarking);
  const submittedAt = new Date();
  await db.update(attempts).set({ status, submittedAt, score: String(result.score), percentage: String(result.percentage), activeAttemptKey: null }).where(and(eq(attempts.id, attempt.id), eq(attempts.studentId, attempt.studentId), eq(attempts.status, "IN_PROGRESS")));
  return { ...result, status, submittedAt };
}

async function expireAndThrow(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, attempt: typeof attempts.$inferSelect, assessment: typeof assessments.$inferSelect) {
  if (!isExpired(attempt.expiresAt)) return;
  await scoreAndClose(db, attempt, assessment, "EXPIRED");
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: "ATTEMPT_EXPIRED" });
}

export const attemptRouter = router({
  start: protectedProcedure.input(z.object({ assessmentId: z.number().int().positive(), accessCode: z.string().trim().max(32).optional() })).mutation(async ({ ctx, input }) => {
    const actor = requireRole(ctx.user, ["STUDENT"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
    const now = new Date();
    const [assessmentRows, assignmentRows] = await Promise.all([
      db.select().from(assessments).where(eq(assessments.id, input.assessmentId)).limit(1),
      db.select().from(assessmentAssignments).where(and(eq(assessmentAssignments.assessmentId, input.assessmentId), eq(assessmentAssignments.studentId, actor.id), eq(assessmentAssignments.status, "ASSIGNED"))).limit(1),
    ]);
    const assessment = assessmentRows[0];
    const assignment = assignmentRows[0];
    if (!assignment || assignment.schoolId !== actor.schoolId || assignment.studentId !== actor.id) throw new TRPCError({ code: "FORBIDDEN", message: "NOT_ASSIGNED_TO_TEST" });
    if (!assessment || assessment.schoolId !== actor.schoolId || !["PUBLISHED", "ACTIVE"].includes(assessment.status)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "TEST_NOT_PUBLISHED" });
    if (assessment.startAt > now) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "TEST_NOT_STARTED" });
    if (assessment.endAt <= now) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "TEST_EXPIRED" });
    if (assessment.accessCodeEnabled && input.accessCode?.toUpperCase() !== assessment.accessCode) throw new TRPCError({ code: "UNAUTHORIZED", message: "INVALID_ACCESS_CODE" });
    const [active, countRows] = await Promise.all([
      db.select().from(attempts).where(and(eq(attempts.assessmentId, assessment.id), eq(attempts.studentId, actor.id), eq(attempts.status, "IN_PROGRESS"))).limit(1),
      db.select({ value: count() }).from(attempts).where(and(eq(attempts.assessmentId, assessment.id), eq(attempts.studentId, actor.id))),
    ]);
    if (active[0]) throw new TRPCError({ code: "CONFLICT", message: "ATTEMPT_ALREADY_IN_PROGRESS" });
    if ((countRows[0]?.value ?? 0) >= assessment.maxAttempts) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "MAX_ATTEMPTS_REACHED" });
    const questions = await db.select().from(assessmentQuestions).where(eq(assessmentQuestions.assessmentId, assessment.id));
    if (!questions.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "INVALID_QUESTION" });
    const orderedQuestions = assessment.randomizeQuestions ? secureShuffle(questions) : [...questions].sort((a, b) => a.position - b.position);
    const optionOrder = Object.fromEntries(orderedQuestions.map(question => [String(question.id), (assessment.randomizeOptions ? secureShuffle(question.options) : question.options).map(option => option.id)]));
    const expiresAt = calculateExpiresAt(now, assessment.endAt, assessment.durationMinutes);
    try {
      await db.insert(attempts).values({ assessmentId: assessment.id, studentId: actor.id, schoolId: actor.schoolId!, teacherId: assessment.teacherId, status: "IN_PROGRESS", startedAt: now, expiresAt, activeAttemptKey: `${assessment.id}:${actor.id}`, answers: {}, questionOrder: orderedQuestions.map(question => question.id), optionOrder });
    } catch {
      throw new TRPCError({ code: "CONFLICT", message: "ATTEMPT_ALREADY_IN_PROGRESS" });
    }
    const attempt = (await db.select().from(attempts).where(and(eq(attempts.assessmentId, assessment.id), eq(attempts.studentId, actor.id), eq(attempts.status, "IN_PROGRESS"))).orderBy(desc(attempts.id)).limit(1))[0];
    await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "ATTEMPT_STARTED", targetType: "ATTEMPT", targetId: attempt?.id, ...requestAuditContext(ctx.req) });
    return { success: true, message: "Assessment attempt started.", data: { attemptId: attempt?.id, expiresAt } };
  }),
  questions: protectedProcedure.input(z.object({ attemptId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const actor = requireRole(ctx.user, ["STUDENT"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
    const attempt = (await db.select().from(attempts).where(and(eq(attempts.id, input.attemptId), eq(attempts.studentId, actor.id), eq(attempts.schoolId, actor.schoolId!), eq(attempts.status, "IN_PROGRESS"))).limit(1))[0];
    if (!attempt || attempt.studentId !== actor.id) throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
    const assessment = (await db.select().from(assessments).where(and(eq(assessments.id, attempt.assessmentId), eq(assessments.schoolId, actor.schoolId!))).limit(1))[0];
    if (!assessment) throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
    await expireAndThrow(db, attempt, assessment);
    const questions = await db.select().from(assessmentQuestions).where(eq(assessmentQuestions.assessmentId, assessment.id));
    const questionMap = new Map(questions.map(question => [question.id, question]));
    const ordered = attempt.questionOrder.map(id => questionMap.get(id)).filter((question): question is (typeof questions)[number] => Boolean(question));
    return { success: true, message: "Attempt questions loaded.", data: ordered.map(question => {
      const optionMap = new Map(question.options.map(option => [option.id, option]));
      const orderedOptions = (attempt.optionOrder[String(question.id)] ?? question.options.map(option => option.id)).map(id => optionMap.get(id)).filter((option): option is (typeof question.options)[number] => Boolean(option));
      return { id: question.id, questionText: question.questionText, marks: question.marks, options: orderedOptions };
    }), expiresAt: attempt.expiresAt, savedAnswers: attempt.answers, antiCheat: assessment.antiCheat ?? {} };
  }),
  saveAnswer: protectedProcedure.input(z.object({ attemptId: z.number().int().positive(), questionId: z.number().int().positive(), selectedOptionId: z.string().trim().min(1).max(72) })).mutation(async ({ ctx, input }) => {
    const actor = requireRole(ctx.user, ["STUDENT"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
    const attempt = (await db.select().from(attempts).where(and(eq(attempts.id, input.attemptId), eq(attempts.studentId, actor.id), eq(attempts.schoolId, actor.schoolId!), eq(attempts.status, "IN_PROGRESS"))).limit(1))[0];
    if (!attempt || attempt.studentId !== actor.id) throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
    const assessment = (await db.select().from(assessments).where(and(eq(assessments.id, attempt.assessmentId), eq(assessments.schoolId, actor.schoolId!))).limit(1))[0];
    if (!assessment) throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
    await expireAndThrow(db, attempt, assessment);
    const question = (await db.select().from(assessmentQuestions).where(and(eq(assessmentQuestions.id, input.questionId), eq(assessmentQuestions.assessmentId, attempt.assessmentId))).limit(1))[0];
    if (!question || !question.options.some(option => option.id === input.selectedOptionId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Question or selected option is invalid." });
    await db.update(attempts).set({ answers: { ...attempt.answers, [String(input.questionId)]: input.selectedOptionId } }).where(and(eq(attempts.id, attempt.id), eq(attempts.studentId, actor.id), eq(attempts.status, "IN_PROGRESS")));
    return { success: true, message: "Answer autosaved.", data: { savedAt: new Date(), expiresAt: attempt.expiresAt } };
  }),
  submit: protectedProcedure.input(z.object({ attemptId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const actor = requireRole(ctx.user, ["STUDENT"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
    const attempt = (await db.select().from(attempts).where(and(eq(attempts.id, input.attemptId), eq(attempts.studentId, actor.id), eq(attempts.schoolId, actor.schoolId!), eq(attempts.status, "IN_PROGRESS"))).limit(1))[0];
    if (!attempt || attempt.studentId !== actor.id) throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
    const assessment = (await db.select().from(assessments).where(and(eq(assessments.id, attempt.assessmentId), eq(assessments.schoolId, actor.schoolId!))).limit(1))[0];
    if (!assessment) throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
    const result = await scoreAndClose(db, attempt, assessment, isExpired(attempt.expiresAt) ? "EXPIRED" : "SUBMITTED");
    await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: result.status === "EXPIRED" ? "ATTEMPT_EXPIRED" : "ATTEMPT_SUBMITTED", targetType: "ATTEMPT", targetId: attempt.id, metadata: { score: result.score, percentage: result.percentage }, ...requestAuditContext(ctx.req) });
    return { success: true, message: result.status === "EXPIRED" ? "Attempt expired and was scored using saved answers." : "Attempt submitted and scored.", data: result };
  }),
  recordViolation: protectedProcedure.input(z.object({ attemptId: z.number().int().positive(), eventType, metadata: z.record(z.string(), z.string()).optional() })).mutation(async ({ ctx, input }) => {
    const actor = requireRole(ctx.user, ["STUDENT"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
    const attempt = (await db.select().from(attempts).where(and(eq(attempts.id, input.attemptId), eq(attempts.studentId, actor.id), eq(attempts.schoolId, actor.schoolId!), eq(attempts.status, "IN_PROGRESS"))).limit(1))[0];
    if (!attempt || attempt.studentId !== actor.id) throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
    const assessment = (await db.select().from(assessments).where(and(eq(assessments.id, attempt.assessmentId), eq(assessments.schoolId, actor.schoolId!))).limit(1))[0];
    if (!assessment) throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
    await expireAndThrow(db, attempt, assessment);
    const policy = (assessment.antiCheat ?? {}) as Record<string, unknown>;
    await db.insert(integrityViolations).values({ attemptId: attempt.id, studentId: actor.id, eventType: input.eventType, metadata: input.metadata ?? null });
    const violationCount = attempt.violationCount + 1;
    await db.update(attempts).set({ violationCount }).where(and(eq(attempts.id, attempt.id), eq(attempts.status, "IN_PROGRESS")));
    const autoSubmit = shouldAutoSubmit(violationCount, policy);
    const result = autoSubmit ? await scoreAndClose(db, { ...attempt, violationCount }, assessment, "AUTO_SUBMITTED") : null;
    await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: autoSubmit ? "ATTEMPT_AUTO_SUBMITTED" : "INTEGRITY_VIOLATION", targetType: "ATTEMPT", targetId: attempt.id, metadata: { eventType: input.eventType, violationCount }, ...requestAuditContext(ctx.req) });
    return { success: true, message: autoSubmit ? "Violation threshold reached; the attempt was automatically submitted." : "Integrity event recorded.", data: { violationCount, autoSubmitted: autoSubmit, result } };
  }),
  myResults: protectedProcedure.query(async ({ ctx }) => {
    const actor = requireRole(ctx.user, ["STUDENT"]);
    const db = await getDb();
    if (!db) return { success: true, message: "No database connection.", data: [] };
    const records = await db.select({ attempt: attempts, assessment: assessments }).from(attempts).innerJoin(assessments, eq(assessments.id, attempts.assessmentId)).where(and(eq(attempts.studentId, actor.id), eq(attempts.schoolId, actor.schoolId!), eq(assessments.schoolId, actor.schoolId!))).orderBy(desc(attempts.createdAt));
    return { success: true, message: "Result history loaded.", data: records.map(record => ({ id: record.attempt.id, title: record.assessment.title, status: record.attempt.status, score: record.attempt.score, percentage: record.attempt.percentage, violationCount: record.attempt.violationCount, submittedAt: record.attempt.submittedAt })) };
  }),
});
