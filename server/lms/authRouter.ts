import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { collections } from "../mongo";
import { publicUser, getCredentialUser, getDb } from "../db";
import { createLmsSession, LMS_SESSION_COOKIE, lmsSessionCookieOptions } from "./auth";
import { getSessionCookieOptions } from "../_core/cookies";
import { publicProcedure, router } from "../_core/trpc";
import { writeAudit, requestAuditContext } from "./utils";

const credentialRoles = ["ADMIN", "TEACHER", "STUDENT"] as const;

export const lmsAuthRouter = router({
  me: publicProcedure.query(({ ctx }) => (ctx.user ? publicUser(ctx.user) : null)),
  login: publicProcedure.input(z.object({ role: z.enum(credentialRoles), institutionCode: z.string().trim().min(4).max(32), identifier: z.string().trim().min(2).max(320), password: z.string().min(8).max(128) })).mutation(async ({ ctx, input }) => {
    const user = await getCredentialUser({ role: input.role, institutionCode: input.institutionCode, identifier: input.identifier }); const valid = Boolean(user?.passwordHash && await bcrypt.compare(input.password, user.passwordHash));
    if (!valid || !user || user.status !== "ACTIVE") throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid issued credentials, institution code, or inactive account." });
    const db = await getDb(); await collections(db).users.updateOne({ id: user.id, schoolId: user.schoolId }, { $set: { lastLogin: new Date(), lastSignedIn: new Date(), updatedAt: new Date() } }); const token = await createLmsSession(user); ctx.res.cookie(LMS_SESSION_COOKIE, token, getSessionCookieOptions(ctx.req)); await writeAudit(db, { actorId: user.id, actorRole: user.role, schoolId: user.schoolId, action: "AUTH_LOGIN", targetType: "USER", targetId: user.id, ...requestAuditContext(ctx.req) }); return { success: true, message: "Signed in successfully.", data: { user: publicUser(user) } };
  }),
  logout: publicProcedure.mutation(({ ctx }) => { ctx.res.clearCookie(LMS_SESSION_COOKIE, { ...getSessionCookieOptions(ctx.req), maxAge: -1 }); return { success: true, message: "Signed out successfully.", data: null }; }),
});
