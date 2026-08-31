import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { collections, nextId } from "../mongo";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { requireRole } from "./guards";
import { columnMapping, importAcademicFields, normalizeImportRows, summarizeImportRows, validateCanonicalRosterRows, type ImportRow } from "./importUtils";
import { requestAuditContext, writeAudit } from "./utils";
import type { ImportBatch, LmsUser, StudentProfile } from "./types";

const rawRow = z.record(z.string(), z.string());

export const importRouter = router({
  preview: protectedProcedure.input(z.object({ sourceName: z.string().trim().min(1).max(255), rows: z.array(rawRow).min(1).max(1000) })).mutation(async ({ ctx, input }) => {
    const actor = requireRole(ctx.user, ["TEACHER"]); const db = await getDb(); const c = collections(db); try { validateCanonicalRosterRows(input.rows); } catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "ROSTER_TEMPLATE_HEADERS_REQUIRED" }); } const normalized = normalizeImportRows(input.rows);
    for (const row of normalized) {
      if (!row.valid) continue;
      let existing = await c.users.findOne({ schoolId: actor.schoolId!, $or: [{ email: row.email }, { username: row.username }] });
      if (!existing && (row.usn || row.studentId)) {
        const profileMatch = await c.studentProfiles.findOne({ schoolId: actor.schoolId!, $or: [...(row.usn ? [{ usn: row.usn }] : []), ...(row.studentId ? [{ studentId: row.studentId }] : [])] });
        if (profileMatch) existing = await c.users.findOne({ id: profileMatch.studentUserId, schoolId: actor.schoolId! });
      }
      if (existing) {
        if (existing.role === "STUDENT") {
          const owned = existing.teacherId === actor.id;
          row.errors.push(owned ? "Existing student will be updated after confirmation." : "Existing student in institution (will be updated and added to your roster after confirmation).");
          row.valid = true;
        } else {
          row.errors.push("Email or username belongs to a non-student staff account.");
          row.valid = false;
        }
      }
    }
    const summary = summarizeImportRows(normalized); const now = new Date(); const batch: ImportBatch = { id: await nextId(db, "importBatches"), schoolId: actor.schoolId!, teacherId: actor.id, status: "PREVIEWED", sourceName: input.sourceName, rows: normalized as unknown as Array<Record<string, unknown>>, summary, confirmedAt: null, createdAt: now, updatedAt: now }; await c.importBatches.insertOne(batch); return { success: true, message: "Import preview created. No student records were changed.", data: { batchId: batch.id, mapping: columnMapping, summary, rows: normalized } };
  }),
  confirm: protectedProcedure.input(z.object({ batchId: z.number().int().positive(), defaultTemporaryPassword: z.string().min(1).max(128).optional() })).mutation(async ({ ctx, input }) => {
    const actor = requireRole(ctx.user, ["TEACHER"]); const db = await getDb(); const c = collections(db); const batch = await c.importBatches.findOne({ id: input.batchId, teacherId: actor.id, schoolId: actor.schoolId! }); if (!batch || batch.status !== "PREVIEWED") throw new TRPCError({ code: "NOT_FOUND", message: "A pending import preview in your scope was not found." }); const rows = batch.rows as unknown as ImportRow[]; const result = { total: rows.length, created: 0, updated: 0, duplicates: 0, invalid: 0 };
    for (const row of rows) {
      if (!row.valid) { result.invalid += 1; continue; }
      let existing = await c.users.findOne({ schoolId: actor.schoolId!, $or: [{ email: row.email }, { username: row.username }] });
      if (!existing && (row.usn || row.studentId)) {
        const profileMatch = await c.studentProfiles.findOne({ schoolId: actor.schoolId!, $or: [...(row.usn ? [{ usn: row.usn }] : []), ...(row.studentId ? [{ studentId: row.studentId }] : [])] });
        if (profileMatch) existing = await c.users.findOne({ id: profileMatch.studentUserId, schoolId: actor.schoolId! });
      }
      const now = new Date();
      // If teacher provided a custom password, ALWAYS use it. Otherwise fall back to USN → studentId → username.
      const customPassword = (input.defaultTemporaryPassword ?? "").trim();
      const fallbackPassword = (row.usn || row.studentId || row.username || "").trim();
      const defaultPassword = customPassword.length >= 6 ? customPassword : (fallbackPassword.length >= 6 ? fallbackPassword : customPassword);
      const passwordHash = await bcrypt.hash(defaultPassword, 12);
      if (existing) {
        if (existing.role !== "STUDENT") { result.duplicates += 1; continue; }
        await c.users.updateOne({ id: existing.id }, { $set: { name: row.name, status: "ACTIVE", passwordHash, updatedAt: now } });
        await c.studentProfiles.updateOne(
          { studentUserId: existing.id },
          {
            $set: { ...importAcademicFields(row), teacherId: actor.id, schoolId: actor.schoolId!, importBatchId: batch.id, updatedAt: now },
            $setOnInsert: { id: await nextId(db, "studentProfiles"), createdAt: now }
          },
          { upsert: true }
        );
        result.updated += 1; continue;
      }
      const user: LmsUser = { id: await nextId(db, "users"), openId: null, name: row.name, email: row.email, loginMethod: "credentials", username: row.username, passwordHash, role: "STUDENT", schoolId: actor.schoolId!, teacherId: actor.id, status: "ACTIVE", lastLogin: null, createdAt: now, updatedAt: now, lastSignedIn: now };
      const profile: StudentProfile = { id: await nextId(db, "studentProfiles"), studentUserId: user.id, schoolId: actor.schoolId!, teacherId: actor.id, importBatchId: batch.id, ...importAcademicFields(row), createdAt: now, updatedAt: now };
      await c.users.insertOne(user); await c.studentProfiles.insertOne(profile); result.created += 1;
    }
    await c.importBatches.updateOne({ id: batch.id, teacherId: actor.id, schoolId: actor.schoolId! }, { $set: { status: "CONFIRMED", confirmedAt: new Date(), updatedAt: new Date() } }); await writeAudit(db, { actorId: actor.id, actorRole: actor.role, schoolId: actor.schoolId, action: "STUDENT_IMPORT_CONFIRMED", targetType: "IMPORT_BATCH", targetId: batch.id, metadata: result, ...requestAuditContext(ctx.req) }); return { success: true, message: "Student import confirmed.", data: { summary: result, errors: [] } };
  }),
});
