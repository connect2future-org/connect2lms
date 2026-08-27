import {
  boolean,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const roleValues = ["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT"] as const;
export const userStatusValues = ["ACTIVE", "INACTIVE", "DISABLED"] as const;
export const schoolStatusValues = ["ACTIVE", "DISABLED", "ARCHIVED"] as const;
export const assessmentStatusValues = ["DRAFT", "PUBLISHED", "ACTIVE", "COMPLETED", "ARCHIVED"] as const;
export const attemptStatusValues = ["IN_PROGRESS", "SUBMITTED", "AUTO_SUBMITTED", "EXPIRED"] as const;

export type LmsRole = (typeof roleValues)[number];

/** Unified identity model. OAuth identities and provisioned password identities share one record. */
export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).unique(),
    name: varchar("name", { length: 180 }),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    username: varchar("username", { length: 80 }),
    passwordHash: varchar("passwordHash", { length: 255 }),
    role: mysqlEnum("role", roleValues).default("STUDENT").notNull(),
    schoolId: int("schoolId"),
    teacherId: int("teacherId"),
    status: mysqlEnum("status", userStatusValues).default("ACTIVE").notNull(),
    lastLogin: timestamp("lastLogin"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_username_unique").on(table.username),
    index("users_school_role_idx").on(table.schoolId, table.role),
    index("users_teacher_idx").on(table.teacherId),
  ],
);

export const schools = mysqlTable(
  "schools",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 180 }).notNull(),
    code: varchar("code", { length: 32 }).notNull(),
    institutionType: varchar("institutionType", { length: 80 }).notNull(),
    contactEmail: varchar("contactEmail", { length: 320 }),
    contactPhone: varchar("contactPhone", { length: 48 }),
    address: text("address"),
    status: mysqlEnum("status", schoolStatusValues).default("ACTIVE").notNull(),
    createdByUserId: int("createdByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("schools_code_unique").on(table.code), index("schools_status_idx").on(table.status)],
);

export const studentProfiles = mysqlTable(
  "studentProfiles",
  {
    id: int("id").autoincrement().primaryKey(),
    studentUserId: int("studentUserId").notNull(),
    schoolId: int("schoolId").notNull(),
    teacherId: int("teacherId").notNull(),
    studentId: varchar("studentId", { length: 100 }),
    usn: varchar("usn", { length: 100 }),
    branch: varchar("branch", { length: 120 }),
    semester: varchar("semester", { length: 40 }),
    section: varchar("section", { length: 40 }),
    className: varchar("className", { length: 120 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("student_profile_user_unique").on(table.studentUserId),
    uniqueIndex("student_profile_school_student_unique").on(table.schoolId, table.studentId),
    index("student_profile_teacher_idx").on(table.teacherId, table.schoolId),
  ],
);

export const assessments = mysqlTable(
  "assessments",
  {
    id: int("id").autoincrement().primaryKey(),
    schoolId: int("schoolId").notNull(),
    teacherId: int("teacherId").notNull(),
    createdByUserId: int("createdByUserId").notNull(),
    title: varchar("title", { length: 220 }).notNull(),
    description: text("description"),
    startAt: timestamp("startAt").notNull(),
    endAt: timestamp("endAt").notNull(),
    durationMinutes: int("durationMinutes").notNull(),
    maxAttempts: int("maxAttempts").default(1).notNull(),
    accessCode: varchar("accessCode", { length: 32 }),
    accessCodeEnabled: boolean("accessCodeEnabled").default(true).notNull(),
    randomizeQuestions: boolean("randomizeQuestions").default(false).notNull(),
    randomizeOptions: boolean("randomizeOptions").default(false).notNull(),
    negativeMarking: boolean("negativeMarking").default(false).notNull(),
    antiCheat: json("antiCheat").$type<Record<string, unknown> | null>(),
    status: mysqlEnum("status", assessmentStatusValues).default("DRAFT").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("assessments_school_status_idx").on(table.schoolId, table.status),
    index("assessments_teacher_idx").on(table.teacherId, table.createdAt),
    uniqueIndex("assessments_access_code_unique").on(table.accessCode),
  ],
);

export const assessmentQuestions = mysqlTable(
  "assessmentQuestions",
  {
    id: int("id").autoincrement().primaryKey(),
    assessmentId: int("assessmentId").notNull(),
    position: int("position").notNull(),
    type: mysqlEnum("type", ["MCQ"]).default("MCQ").notNull(),
    questionText: text("questionText").notNull(),
    options: json("options").$type<Array<{ id: string; text: string }>>().notNull(),
    correctOptionId: varchar("correctOptionId", { length: 72 }).notNull(),
    marks: decimal("marks", { precision: 8, scale: 2 }).default("1.00").notNull(),
    negativeMarks: decimal("negativeMarks", { precision: 8, scale: 2 }).default("0.00").notNull(),
    metadata: json("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("assessment_question_position_unique").on(table.assessmentId, table.position),
    index("assessment_question_assessment_idx").on(table.assessmentId),
  ],
);

export const assessmentAssignments = mysqlTable(
  "assessmentAssignments",
  {
    id: int("id").autoincrement().primaryKey(),
    assessmentId: int("assessmentId").notNull(),
    studentId: int("studentId").notNull(),
    schoolId: int("schoolId").notNull(),
    teacherId: int("teacherId").notNull(),
    assignedByUserId: int("assignedByUserId").notNull(),
    status: mysqlEnum("status", ["ASSIGNED", "REVOKED"]).default("ASSIGNED").notNull(),
    assignedAt: timestamp("assignedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("assignment_assessment_student_unique").on(table.assessmentId, table.studentId),
    index("assignment_student_status_idx").on(table.studentId, table.status),
  ],
);

export const attempts = mysqlTable(
  "attempts",
  {
    id: int("id").autoincrement().primaryKey(),
    assessmentId: int("assessmentId").notNull(),
    studentId: int("studentId").notNull(),
    schoolId: int("schoolId").notNull(),
    teacherId: int("teacherId").notNull(),
    status: mysqlEnum("status", attemptStatusValues).default("IN_PROGRESS").notNull(),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    activeAttemptKey: varchar("activeAttemptKey", { length: 80 }),
    submittedAt: timestamp("submittedAt"),
    answers: json("answers").$type<Record<string, string>>().notNull(),
    questionOrder: json("questionOrder").$type<number[]>().notNull(),
    optionOrder: json("optionOrder").$type<Record<string, string[]>>().notNull(),
    score: decimal("score", { precision: 9, scale: 2 }).default("0.00").notNull(),
    percentage: decimal("percentage", { precision: 6, scale: 2 }).default("0.00").notNull(),
    violationCount: int("violationCount").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("attempts_assessment_student_idx").on(table.assessmentId, table.studentId),
    index("attempts_student_status_idx").on(table.studentId, table.status),
    index("attempts_school_teacher_idx").on(table.schoolId, table.teacherId),
    uniqueIndex("attempts_active_attempt_unique").on(table.activeAttemptKey),
  ],
);

export const integrityViolations = mysqlTable(
  "integrityViolations",
  {
    id: int("id").autoincrement().primaryKey(),
    attemptId: int("attemptId").notNull(),
    studentId: int("studentId").notNull(),
    eventType: mysqlEnum("eventType", ["TAB_HIDDEN", "WINDOW_BLUR", "FULLSCREEN_EXIT", "COPY", "PASTE", "CUT", "CONTEXT_MENU", "SHORTCUT"]).notNull(),
    recordedAt: timestamp("recordedAt").defaultNow().notNull(),
    metadata: json("metadata").$type<Record<string, unknown> | null>(),
  },
  table => [index("violations_attempt_idx").on(table.attemptId, table.recordedAt)],
);

export const importBatches = mysqlTable(
  "importBatches",
  {
    id: int("id").autoincrement().primaryKey(),
    teacherId: int("teacherId").notNull(),
    schoolId: int("schoolId").notNull(),
    sourceName: varchar("sourceName", { length: 255 }).notNull(),
    status: mysqlEnum("status", ["PREVIEWED", "CONFIRMED", "REJECTED"]).default("PREVIEWED").notNull(),
    rows: json("rows").$type<Array<Record<string, unknown>>>().notNull(),
    summary: json("summary").$type<Record<string, number>>().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    confirmedAt: timestamp("confirmedAt"),
  },
  table => [index("import_batch_teacher_idx").on(table.teacherId, table.status)],
);

export const auditLogs = mysqlTable(
  "auditLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    actorId: int("actorId").notNull(),
    actorRole: mysqlEnum("actorRole", roleValues).notNull(),
    schoolId: int("schoolId"),
    action: varchar("action", { length: 100 }).notNull(),
    targetType: varchar("targetType", { length: 80 }).notNull(),
    targetId: varchar("targetId", { length: 80 }),
    metadata: json("metadata").$type<Record<string, unknown> | null>(),
    ip: varchar("ip", { length: 80 }),
    userAgent: varchar("userAgent", { length: 512 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("audit_school_created_idx").on(table.schoolId, table.createdAt),
    index("audit_actor_created_idx").on(table.actorId, table.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
