import bcrypt from "bcryptjs";
import { and, desc, eq, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { importBatches, studentProfiles, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { requireRole } from "./guards";
import { columnMapping, normalizeImportRows, type ImportRow } from "./importUtils";
import { requestAuditContext, writeAudit } from "./utils";

const rawRow = z.record(z.string(), z.string());

export const importRouter = router({
  preview: protectedProcedure
    .input(z.object({ sourceName: z.string().trim().min(1).max(255), rows: z.array(rawRow).min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["TEACHER"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
      const normalized = normalizeImportRows(input.rows);
      const emails = normalized.filter(row => row.valid).map(row => row.email);
      const usernames = normalized.filter(row => row.valid).map(row => row.username);
      for (const row of normalized) {
        if (!row.valid) continue;
        const existing = await db.select().from(users).where(or(eq(users.email, row.email), eq(users.username, row.username))).limit(1);
        if (existing[0]) {
          row.errors.push(existing[0].schoolId === actor.schoolId && existing[0].teacherId === actor.id && existing[0].role === "STUDENT" ? "Existing student will be updated after confirmation." : "Identity already exists outside your student scope.");
          if (!(existing[0].schoolId === actor.schoolId && existing[0].teacherId === actor.id && existing[0].role === "STUDENT")) row.valid = false;
        }
      }
      const summary = {
        total: normalized.length,
        valid: normalized.filter(row => row.valid).length,
        invalid: normalized.filter(row => !row.valid).length,
        existing: normalized.filter(row => row.errors.some(error => error.startsWith("Existing student"))).length,
        duplicates: normalized.filter(row => row.errors.some(error => error.includes("Duplicate") || error.includes("outside your"))).length,
        new: normalized.filter(row => row.valid && !row.errors.length).length,
      };
      await db.insert(importBatches).values({ teacherId: actor.id, schoolId: actor.schoolId!, sourceName: input.sourceName, rows: normalized as unknown as Array<Record<string, unknown>>, summary });
      const batch = (await db.select({ id: importBatches.id }).from(importBatches).where(and(eq(importBatches.teacherId, actor.id), eq(importBatches.sourceName, input.sourceName))).orderBy(desc(importBatches.id)).limit(1))[0];
      return { success: true, message: "Import preview created. No student records were changed.", data: { batchId: batch?.id, mapping: columnMapping, summary, rows: normalized } };
    }),
  confirm: protectedProcedure
    .input(z.object({ batchId: z.number().int().positive(), defaultTemporaryPassword: z.string().min(12).max(128) }))
    .mutation(async ({ ctx, input }) => {
      const actor = requireRole(ctx.user, ["TEACHER"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection is not available." });
      const batch = (await db.select().from(importBatches).where(and(eq(importBatches.id, input.batchId), eq(importBatches.teacherId, actor.id), eq(importBatches.schoolId, actor.schoolId!))).limit(1))[0];
      if (!batch || batch.status !== "PREVIEWED") throw new TRPCError({ code: "NOT_FOUND", message: "A pending import preview in your scope was not found." });
      const rows = batch.rows as unknown as ImportRow[];
      const result = { total: rows.length, created: 0, updated: 0, duplicates: 0, invalid: 0 };
      for (const row of rows) {
        if (!row.valid) { result.invalid += 1; continue; }
        const existing = (await db.select().from(users).where(or(eq(users.email, row.email), eq(users.username, row.username))).limit(1))[0];
        if (existing) {
          if (existing.role !== "STUDENT" || existing.schoolId !== actor.schoolId || existing.teacherId !== actor.id) { result.duplicates += 1; continue; }
          await db.update(users).set({ name: row.name }).where(eq(users.id, existing.id));
          await db.update(studentProfiles).set({ studentId: row.studentId || null, usn: row.usn || null, branch: row.branch || null, semester: row.semester || null, section: row.section || null, className: row.className || null }).where(and(eq(studentProfiles.studentUserId, existing.id), eq(studentProfiles.teacherId, actor.id)));
          result.updated += 1;
          continue;
        }
        await db.insert(users).values({ name: row.name, email: row.email, username: row.username, passwordHash: await bcrypt.hash(input.defaultTemporaryPassword, 12), role: "STUDENT", schoolId: actor.schoolId!, teacherId: actor.id, status: "ACTIVE", lastSignedIn: new Date() });
        const user = (await db.select().from(users).where(eq(users.email, row.email)).limit(1))[0];
        if (!user) { result.invalid += 1; continue; }
        await db.insert(studentProfiles).values({ studentUserId: user.id, schoolId: actor.schoolId!, teacherId: actor.id, studentId: row.studentId || null, usn: row.usn || null, branch: row.branch || null, semester: row.semester || null, section: row.section || null, className: row.className || null });
        result.created += 1;
      }
      await db.update(importBatches).set({ status: "CONFIRMED", confirmedAt: new Date() }).where(eq(importBatches.id, batch.id));
      await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "STUDENT_IMPORT_CONFIRMED", targetType: "IMPORT_BATCH", targetId: batch.id, metadata: result, ...requestAuditContext(ctx.req) });
      return { success: true, message: "Student import confirmed.", data: { summary: result, errors: [] } };
    }),
});
