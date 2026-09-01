import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { collections, nextId } from "../mongo";
import { getDb, publicUser } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { requireRole } from "./guards";
import { requestAuditContext, writeAudit } from "./utils";
import type { StudentTable } from "./types";

/** Fully purge a single student: user account, profile, assignments, attempts, and table memberships. */
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

export const tableRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const actor = requireRole(ctx.user, ["TEACHER"]);
    const db = await getDb();
    const c = collections(db);
    const tables = await c.studentTables
      .find({ schoolId: actor.schoolId!, teacherId: actor.id })
      .sort({ createdAt: -1 })
      .toArray();

    const allStudentIds = Array.from(new Set(tables.flatMap(t => t.studentUserIds)));
    const users = allStudentIds.length
      ? await c.users.find({ id: { $in: allStudentIds }, schoolId: actor.schoolId! }).toArray()
      : [];
    const profiles = allStudentIds.length
      ? await c.studentProfiles.find({ studentUserId: { $in: allStudentIds }, schoolId: actor.schoolId! }).toArray()
      : [];

    const userById = new Map(users.map(u => [u.id, u]));
    const profileById = new Map(profiles.map(p => [p.studentUserId, p]));

    const populated = tables.map(table => {
      const students = table.studentUserIds.flatMap(id => {
        const u = userById.get(id);
        if (!u) return [];
        return [{ ...publicUser(u), profile: profileById.get(id) }];
      });
      return { ...table, students };
    });

    return { success: true, message: "Tables loaded.", data: populated };
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(255).optional(), studentUserIds: z.array(z.number().int().positive()).optional() }))
    .mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["TEACHER"]);
      const db = await getDb();
      const c = collections(db);

      const existing = await c.studentTables.findOne({ schoolId: actor.schoolId!, teacherId: actor.id, name: { $regex: `^${input.name.trim()}$`, $options: "i" } });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "A table with this name already exists." });

      const now = new Date();
      const table: StudentTable = { id: await nextId(db, "studentTables"), schoolId: actor.schoolId!, teacherId: actor.id, name: input.name.trim(), description: input.description || null, studentUserIds: Array.from(new Set(input.studentUserIds || [])), createdAt: now, updatedAt: now };
      await c.studentTables.insertOne(table);
      await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "STUDENT_TABLE_CREATED", targetType: "STUDENT_TABLE", targetId: table.id, metadata: { name: table.name, count: table.studentUserIds.length }, ...requestAuditContext(ctx.req) });
      return { success: true, message: `Table "${table.name}" created.`, data: table };
    }),

  // Deletes the table AND permanently purges ALL students inside it (accounts, profiles, assignments, attempts)
  delete: protectedProcedure
    .input(z.object({ tableId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["TEACHER"]);
      const db = await getDb();
      const c = collections(db);

      const table = await c.studentTables.findOne({ id: input.tableId, schoolId: actor.schoolId!, teacherId: actor.id });
      if (!table) throw new TRPCError({ code: "NOT_FOUND", message: "Table not found in your scope." });

      // Hard-purge every student in the table
      await Promise.all(table.studentUserIds.map(sid => purgeStudentById(db, actor.schoolId!, sid)));
      // Then delete the table itself
      await c.studentTables.deleteOne({ id: table.id });

      await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "STUDENT_TABLE_DELETED", targetType: "STUDENT_TABLE", targetId: table.id, metadata: { name: table.name, purgedStudents: table.studentUserIds.length }, ...requestAuditContext(ctx.req) });
      return { success: true, message: `Table "${table.name}" and all ${table.studentUserIds.length} student(s) permanently deleted.`, data: { tableId: table.id, deletedStudentCount: table.studentUserIds.length } };
    }),

  addStudents: protectedProcedure
    .input(
      z.object({
        tableId: z.number().int().positive(),
        studentUserIds: z.array(z.number().int().positive()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["TEACHER"]);
      const db = await getDb();
      const c = collections(db);

      const table = await c.studentTables.findOne({
        id: input.tableId,
        schoolId: actor.schoolId!,
        teacherId: actor.id,
      });
      if (!table) throw new TRPCError({ code: "NOT_FOUND", message: "Table not found." });

      const updatedIds = Array.from(new Set([...table.studentUserIds, ...input.studentUserIds]));
      await c.studentTables.updateOne(
        { id: table.id },
        { $set: { studentUserIds: updatedIds, updatedAt: new Date() } }
      );

      return { success: true, message: `Students added to "${table.name}".`, data: { tableId: table.id } };
    }),

  removeStudent: protectedProcedure
    .input(
      z.object({
        tableId: z.number().int().positive(),
        studentUserId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["TEACHER"]);
      const db = await getDb();
      const c = collections(db);

      const table = await c.studentTables.findOne({
        id: input.tableId,
        schoolId: actor.schoolId!,
        teacherId: actor.id,
      });
      if (!table) throw new TRPCError({ code: "NOT_FOUND", message: "Table not found." });

      const updatedIds = table.studentUserIds.filter(id => id !== input.studentUserId);
      await c.studentTables.updateOne(
        { id: table.id },
        { $set: { studentUserIds: updatedIds, updatedAt: new Date() } }
      );

      return { success: true, message: `Student removed from "${table.name}".`, data: { tableId: table.id } };
    }),

  transferStudents: protectedProcedure
    .input(
      z.object({
        sourceTableId: z.number().int().positive(),
        targetTableId: z.number().int().positive(),
        studentUserIds: z.array(z.number().int().positive()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["TEACHER"]);
      const db = await getDb();
      const c = collections(db);

      const [source, target] = await Promise.all([
        c.studentTables.findOne({ id: input.sourceTableId, schoolId: actor.schoolId!, teacherId: actor.id }),
        c.studentTables.findOne({ id: input.targetTableId, schoolId: actor.schoolId!, teacherId: actor.id }),
      ]);
      if (!source || !target) throw new TRPCError({ code: "NOT_FOUND", message: "Source or target table not found." });

      // Copy students to target table WITHOUT removing from source
      const newTargetIds = Array.from(new Set([...target.studentUserIds, ...input.studentUserIds]));

      await c.studentTables.updateOne({ id: target.id }, { $set: { studentUserIds: newTargetIds, updatedAt: new Date() } });

      return {
        success: true,
        message: `Copied ${input.studentUserIds.length} student(s) from "${source.name}" to "${target.name}". Students remain in the original table.`,
        data: { sourceTableId: source.id, targetTableId: target.id },
      };
    }),

  mergeTables: protectedProcedure
    .input(
      z.object({
        sourceTableIds: z.array(z.number().int().positive()).min(2),
        newTableName: z.string().trim().min(2).max(120),
        deleteSourcesAfterMerge: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["TEACHER"]);
      const db = await getDb();
      const c = collections(db);

      const sources = await c.studentTables
        .find({ id: { $in: input.sourceTableIds }, schoolId: actor.schoolId!, teacherId: actor.id })
        .toArray();
      if (sources.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Select at least two valid tables to merge." });

      const mergedStudentIds = Array.from(new Set(sources.flatMap(t => t.studentUserIds)));
      const now = new Date();

      const newTable: StudentTable = {
        id: await nextId(db, "studentTables"),
        schoolId: actor.schoolId!,
        teacherId: actor.id,
        name: input.newTableName.trim(),
        description: `Merged from tables: ${sources.map(s => s.name).join(", ")}`,
        studentUserIds: mergedStudentIds,
        createdAt: now,
        updatedAt: now,
      };

      await c.studentTables.insertOne(newTable);

      if (input.deleteSourcesAfterMerge) {
        await c.studentTables.deleteMany({ id: { $in: sources.map(s => s.id) } });
      }

      await writeAudit(db, {
        actorId: actor.id,
        actorRole: actor.role,
        schoolId: actor.schoolId,
        action: "STUDENT_TABLES_MERGED",
        targetType: "STUDENT_TABLE",
        targetId: newTable.id,
        metadata: { name: newTable.name, count: mergedStudentIds.length, sources: sources.map(s => s.name) },
        ...requestAuditContext(ctx.req),
      });

      return {
        success: true,
        message: `Merged ${sources.length} tables into "${newTable.name}" with ${mergedStudentIds.length} student(s).`,
        data: newTable,
      };
    }),
});
