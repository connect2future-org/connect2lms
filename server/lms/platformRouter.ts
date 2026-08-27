import bcrypt from "bcryptjs";
import { and, count, desc, eq, like, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assessmentAssignments, assessments, auditLogs, schools, studentProfiles, users } from "../../drizzle/schema";
import { getDb, publicUser } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { requireRole, requireSameSchool } from "./guards";
import { generateAvailableSchoolCode, normalizeIdentifier, requestAuditContext, writeAudit } from "./utils";

const adminInput = z.object({
  name: z.string().trim().min(2).max(180),
  email: z.string().trim().email().max(320),
  username: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9._-]+$/),
  temporaryPassword: z.string().min(12).max(128),
});

export const platformRouter = router({
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    requireRole(ctx.user, ["SUPER_ADMIN"]);
    const db = await getDb();
    if (!db) return { success: true, message: "Database unavailable.", data: { metrics: {}, recentActivity: [] } };
    const metric = async (table: typeof schools | typeof users | typeof assessments | typeof assessmentAssignments) => (await db.select({ value: count() }).from(table))[0]?.value ?? 0;
    const [schoolCount, userCount, testCount, assignmentCount, recentActivity] = await Promise.all([
      metric(schools), metric(users), metric(assessments), metric(assessmentAssignments),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(12),
    ]);
    return { success: true, message: "Platform dashboard loaded.", data: { metrics: { schools: schoolCount, users: userCount, assessments: testCount, assignments: assignmentCount }, recentActivity } };
  }),
  schools: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().trim().max(120).optional(), status: z.enum(["ACTIVE", "DISABLED", "ARCHIVED"]).optional() }).optional())
      .query(async ({ ctx, input }) => {
        requireRole(ctx.user, ["SUPER_ADMIN"]);
        const db = await getDb();
        if (!db) return { success: true, message: "No database connection.", data: [] };
        const conditions = [];
        if (input?.status) conditions.push(eq(schools.status, input.status));
        if (input?.search) conditions.push(or(like(schools.name, `%${input.search}%`), like(schools.code, `%${input.search}%`))!);
        const records = await db.select().from(schools).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(schools.createdAt));
        return { success: true, message: "Schools loaded.", data: records };
      }),
    create: protectedProcedure
      .input(z.object({ name: z.string().trim().min(2).max(180), institutionType: z.string().trim().min(2).max(80), contactEmail: z.string().trim().email().optional(), contactPhone: z.string().trim().max(48).optional(), address: z.string().trim().max(1000).optional(), admin: adminInput }))
      .mutation(async ({ ctx, input }) => {
        const actor = requireRole(ctx.user, ["SUPER_ADMIN"]);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
        const code = await generateAvailableSchoolCode(db, input.name);
        const adminEmail = normalizeIdentifier(input.admin.email);
        const existing = await db.select({ id: users.id }).from(users).where(or(eq(users.email, adminEmail), eq(users.username, input.admin.username))).limit(1);
        if (existing[0]) throw new TRPCError({ code: "CONFLICT", message: "The proposed administrator email or username already exists." });
        await db.insert(schools).values({ name: input.name, code, institutionType: input.institutionType, contactEmail: input.contactEmail ?? null, contactPhone: input.contactPhone ?? null, address: input.address ?? null, createdByUserId: actor.id });
        const school = (await db.select().from(schools).where(eq(schools.code, code)).limit(1))[0];
        if (!school) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "School provisioning did not complete." });
        await db.insert(users).values({ name: input.admin.name, email: adminEmail, username: input.admin.username, passwordHash: await bcrypt.hash(input.admin.temporaryPassword, 12), role: "ADMIN", schoolId: school.id, status: "ACTIVE", lastSignedIn: new Date() });
        const admin = (await db.select().from(users).where(eq(users.email, adminEmail)).limit(1))[0];
        await writeAudit(db, { actorId: actor.id, actorRole: actor.role, action: "SCHOOL_PROVISIONED", schoolId: school.id, targetType: "SCHOOL", targetId: school.id, metadata: { code, initialAdminId: admin?.id }, ...requestAuditContext(ctx.req) });
        return { success: true, message: "School and school administrator provisioned.", data: { school, admin: admin ? publicUser(admin) : null } };
      }),
    setStatus: protectedProcedure
      .input(z.object({ schoolId: z.number().int().positive(), status: z.enum(["ACTIVE", "DISABLED", "ARCHIVED"]) }))
      .mutation(async ({ ctx, input }) => {
        const actor = requireRole(ctx.user, ["SUPER_ADMIN"]);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
        const school = (await db.select().from(schools).where(eq(schools.id, input.schoolId)).limit(1))[0];
        if (!school) throw new TRPCError({ code: "NOT_FOUND", message: "School not found." });
        await db.update(schools).set({ status: input.status }).where(eq(schools.id, input.schoolId));
        await writeAudit(db, { actorId: actor.id, actorRole: actor.role, action: `SCHOOL_${input.status}`, schoolId: school.id, targetType: "SCHOOL", targetId: school.id, ...requestAuditContext(ctx.req) });
        return { success: true, message: "School status updated.", data: { schoolId: school.id, status: input.status } };
      }),
  }),
  audit: protectedProcedure
    .input(z.object({ schoolId: z.number().int().positive().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["SUPER_ADMIN", "ADMIN", "TEACHER"]);
      const db = await getDb();
      if (!db) return { success: true, message: "No database connection.", data: [] };
      const schoolId = actor.role === "SUPER_ADMIN" ? input?.schoolId : actor.schoolId!;
      if (input?.schoolId) requireSameSchool(actor, input.schoolId);
      const records = await db.select().from(auditLogs).where(schoolId ? eq(auditLogs.schoolId, schoolId) : undefined).orderBy(desc(auditLogs.createdAt)).limit(100);
      return { success: true, message: "Activity loaded.", data: records };
    }),
});
