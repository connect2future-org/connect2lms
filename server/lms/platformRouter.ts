import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { collections, nextId } from "../mongo";
import { getDb, publicUser } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { requireRole, requireSameSchool } from "./guards";
import { generateAvailableSchoolCode, normalizeIdentifier, requestAuditContext, writeAudit } from "./utils";
import type { LmsUser, School } from "./types";

const adminInput = z.object({ name: z.string().trim().min(2).max(180), email: z.string().trim().email().max(320), username: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9._-]+$/), temporaryPassword: z.string().min(12).max(128) });

export const platformRouter = router({
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    requireRole(ctx.user, ["SUPER_ADMIN"]);
    const db = await getDb();
    const c = collections(db);
    const [schoolCount, userCount, teacherCount, studentCount, adminCount, superAdminCount, testCount, assignmentCount, recentActivity] = await Promise.all([
      c.schools.countDocuments(),
      c.users.countDocuments(),
      c.users.countDocuments({ role: "TEACHER" }),
      c.users.countDocuments({ role: "STUDENT" }),
      c.users.countDocuments({ role: "ADMIN" }),
      c.users.countDocuments({ role: "SUPER_ADMIN" }),
      c.assessments.countDocuments(),
      c.assessmentAssignments.countDocuments(),
      c.auditLogs.find({}).sort({ createdAt: -1 }).limit(12).toArray()
    ]);
    return {
      success: true,
      message: "Platform dashboard loaded.",
      data: {
        metrics: {
          schools: schoolCount,
          users: userCount,
          teachers: teacherCount,
          students: studentCount,
          admins: adminCount,
          superAdmins: superAdminCount,
          assessments: testCount,
          assignments: assignmentCount
        },
        recentActivity
      }
    };
  }),
  schools: router({
    list: protectedProcedure.input(z.object({ search: z.string().trim().max(120).optional(), status: z.enum(["ACTIVE", "DISABLED", "ARCHIVED"]).optional() }).optional()).query(async ({ ctx, input }) => {
      requireRole(ctx.user, ["SUPER_ADMIN"]);
      const db = await getDb();
      const c = collections(db);
      const filter: Record<string, unknown> = {};
      if (input?.status) filter.status = input.status;
      if (input?.search) filter.$or = [{ name: { $regex: input.search, $options: "i" } }, { code: { $regex: input.search, $options: "i" } }];
      const records = await c.schools.find(filter).sort({ createdAt: -1 }).toArray();
      const schoolIds = records.map(s => s.id);
      const admins = schoolIds.length ? await c.users.find({ schoolId: { $in: schoolIds }, role: "ADMIN" }).toArray() : [];
      const adminBySchool = new Map(admins.map(a => [a.schoolId, a]));
      const data = records.map(school => {
        const admin = adminBySchool.get(school.id);
        return {
          ...school,
          adminUsername: admin?.username ?? null,
          adminEmail: admin?.email ?? null,
          initialPassword: (school as any).initialAdminPassword ?? null,
        };
      });
      return { success: true, message: "Schools loaded.", data };
    }),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(180), institutionType: z.string().trim().min(2).max(80), contactEmail: z.string().trim().email().optional(), contactPhone: z.string().trim().max(48).optional(), address: z.string().trim().max(1000).optional(), admin: adminInput })).mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["SUPER_ADMIN"]);
      const db = await getDb();
      const c = collections(db);
      const code = await generateAvailableSchoolCode(db, input.name);
      const schoolId = await nextId(db, "schools");
      const email = normalizeIdentifier(input.admin.email);
      const existing = await c.users.findOne({ schoolId, $or: [{ email }, { username: input.admin.username }] }, { projection: { _id: 1 } });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "The proposed administrator email or username already exists." });
      const now = new Date();
      const school: School & { initialAdminPassword?: string } = {
        id: schoolId,
        name: input.name,
        code,
        institutionType: input.institutionType,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        address: input.address ?? null,
        status: "ACTIVE",
        createdByUserId: actor.id,
        createdAt: now,
        updatedAt: now,
        initialAdminPassword: input.admin.temporaryPassword
      };
      const admin: LmsUser = {
        id: await nextId(db, "users"),
        openId: null,
        name: input.admin.name,
        email,
        loginMethod: "credentials",
        username: input.admin.username,
        passwordHash: await bcrypt.hash(input.admin.temporaryPassword, 12),
        role: "ADMIN",
        schoolId: school.id,
        teacherId: null,
        status: "ACTIVE",
        lastLogin: null,
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now
      };
      await c.schools.insertOne(school as any);
      await c.users.insertOne(admin);
      await writeAudit(db, { actorId: actor.id, actorRole: actor.role, action: "SCHOOL_PROVISIONED", schoolId: school.id, targetType: "SCHOOL", targetId: school.id, metadata: { institutionCode: code, initialAdminId: admin.id }, ...requestAuditContext(ctx.req) });
      return { success: true, message: "School and school administrator provisioned.", data: { school, admin: publicUser(admin) } };
    }),
    setStatus: protectedProcedure.input(z.object({ schoolId: z.number().int().positive(), status: z.enum(["ACTIVE", "DISABLED", "ARCHIVED"]) })).mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["SUPER_ADMIN"]);
      const db = await getDb();
      const c = collections(db);
      const school = await c.schools.findOne({ id: input.schoolId });
      if (!school) throw new TRPCError({ code: "NOT_FOUND", message: "School not found." });
      await c.schools.updateOne({ id: school.id }, { $set: { status: input.status, updatedAt: new Date() } });
      await writeAudit(db, { actorId: actor.id, actorRole: actor.role, action: `SCHOOL_${input.status}`, schoolId: school.id, targetType: "SCHOOL", targetId: school.id, ...requestAuditContext(ctx.req) });
      return { success: true, message: "School status updated.", data: { schoolId: school.id, status: input.status } };
    }),
    remove: protectedProcedure.input(z.object({ schoolId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["SUPER_ADMIN"]);
      const db = await getDb();
      const c = collections(db);
      const school = await c.schools.findOne({ id: input.schoolId });
      if (!school) throw new TRPCError({ code: "NOT_FOUND", message: "School not found." });
      await Promise.all([
        c.users.deleteMany({ schoolId: input.schoolId }),
        c.studentProfiles.deleteMany({ schoolId: input.schoolId }),
        c.assessments.deleteMany({ schoolId: input.schoolId }),
        c.assessmentAssignments.deleteMany({ schoolId: input.schoolId }),
        c.attempts.deleteMany({ schoolId: input.schoolId }),
        c.studentTables.deleteMany({ schoolId: input.schoolId }),
        c.importBatches.deleteMany({ schoolId: input.schoolId }),
      ]);
      await c.schools.deleteOne({ id: input.schoolId });
      await writeAudit(db, { actorId: actor.id, actorRole: actor.role, action: "SCHOOL_DELETED", schoolId: input.schoolId, targetType: "SCHOOL", targetId: input.schoolId, metadata: { hardDeleted: true, institutionName: school.name }, ...requestAuditContext(ctx.req) });
      return { success: true, message: `Institution "${school.name}" and all associated data permanently deleted.`, data: { schoolId: input.schoolId } };
    }),
  }),
  audit: protectedProcedure.input(z.object({ schoolId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => {
    const actor = requireRole(ctx.user, ["SUPER_ADMIN", "ADMIN", "TEACHER"]);
    if (input?.schoolId) requireSameSchool(actor, input.schoolId);
    const schoolId = actor.role === "SUPER_ADMIN" ? input?.schoolId : actor.schoolId!;
    const db = await getDb();
    const records = await collections(db).auditLogs.find(schoolId ? { schoolId } : {}).sort({ createdAt: -1 }).limit(100).toArray();
    return { success: true, message: "Activity loaded.", data: records };
  }),
});
