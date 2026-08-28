export const LMS_ROLES = ["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT"] as const;
export type LmsRole = (typeof LMS_ROLES)[number];
export type AccountStatus = "ACTIVE" | "INACTIVE" | "DISABLED";

export type LmsUser = {
  id: number; openId: string | null; name: string | null; email: string | null; loginMethod: string | null;
  username: string | null; passwordHash: string | null; role: LmsRole; schoolId: number | null; teacherId: number | null;
  status: AccountStatus; lastLogin: Date | null; createdAt: Date; updatedAt: Date; lastSignedIn: Date;
};

export type School = { id: number; name: string; code: string; institutionType: string; contactEmail: string | null; contactPhone: string | null; address: string | null; status: "ACTIVE" | "DISABLED" | "ARCHIVED"; createdByUserId: number; createdAt: Date; updatedAt: Date };
export type StudentProfile = { id: number; studentUserId: number; schoolId: number; teacherId: number; importBatchId?: number | null; studentId: string | null; usn: string | null; branch: string | null; semester: string | null; section: string | null; className: string | null; createdAt: Date; updatedAt: Date };
export type AssessmentStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type Assessment = { id: number; schoolId: number; teacherId: number; title: string; description: string | null; status: AssessmentStatus; startAt: Date; endAt: Date; durationMinutes: number; maxAttempts: number; accessCodeEnabled: boolean; accessCode: string | null; randomizeQuestions: boolean; randomizeOptions: boolean; negativeMarking: boolean; antiCheat: Record<string, unknown>; createdAt: Date; updatedAt: Date };
export type AssessmentQuestion = { id: number; assessmentId: number; schoolId: number; position: number; type: "MCQ"; questionText: string; options: Array<{ id: string; text: string }>; correctOptionId: string; marks: number; negativeMarks: number; createdAt: Date; updatedAt: Date };
export type AssessmentAssignment = { id: number; assessmentId: number; studentId: number; schoolId: number; teacherId: number; status: "ASSIGNED" | "REVOKED"; createdAt: Date; updatedAt: Date };
export type AttemptStatus = "IN_PROGRESS" | "SUBMITTED" | "EXPIRED" | "AUTO_SUBMITTED";
export type Attempt = { id: number; assessmentId: number; studentId: number; schoolId: number; teacherId: number; status: AttemptStatus; startedAt: Date; expiresAt: Date; submittedAt: Date | null; answers: Record<string, string>; questionOrder: number[]; optionOrder: Record<string, string[]>; activeAttemptKey: string | null; score: number | null; percentage: number | null; violationCount: number; createdAt: Date; updatedAt: Date };
export type IntegrityViolation = { id: number; attemptId: number; schoolId: number; studentId: number; type: string; metadata: Record<string, unknown>; occurredAt: Date; createdAt: Date };
export type ImportBatch = { id: number; schoolId: number; teacherId: number; status: "PREVIEWED" | "CONFIRMED" | "REJECTED"; sourceName: string; rows: Array<Record<string, unknown>>; summary: Record<string, number>; confirmedAt: Date | null; createdAt: Date; updatedAt: Date };
export type AuditLog = { id: number; schoolId: number | null; actorId: number | null; actorRole: LmsRole | null; action: string; targetType: string; targetId: number | null; metadata: Record<string, unknown> | null; ip: string | null; userAgent: string | null; createdAt: Date };
