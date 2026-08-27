import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { users } from "../../drizzle/schema";
import { publicUser, getUserByLogin, getDb } from "../db";
import { createLmsSession, LMS_SESSION_COOKIE, lmsSessionCookieOptions } from "./auth";
import { publicProcedure, router } from "../_core/trpc";
import { writeAudit, normalizeIdentifier, requestAuditContext } from "./utils";

export const lmsAuthRouter = router({
  me: publicProcedure.query(({ ctx }) => (ctx.user ? publicUser(ctx.user) : null)),
  login: publicProcedure
    .input(z.object({ identifier: z.string().trim().min(3).max(320), password: z.string().min(8).max(128) }))
    .mutation(async ({ ctx, input }) => {
      const user = await getUserByLogin(normalizeIdentifier(input.identifier));
      const valid = Boolean(user?.passwordHash && (await bcrypt.compare(input.password, user.passwordHash)));
      if (!valid || !user || user.status !== "ACTIVE") {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials or inactive account." });
      }
      if (user.role !== "SUPER_ADMIN" && !user.schoolId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This account has no active school assignment." });
      }
      const token = await createLmsSession(user);
      ctx.res.cookie(LMS_SESSION_COOKIE, token, lmsSessionCookieOptions);
      const db = await getDb();
      if (db) {
        await db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, user.id));
        await writeAudit(db, { actorId: user.id, actorRole: user.role, schoolId: user.schoolId, action: "AUTH_LOGIN", targetType: "USER", targetId: user.id, ...requestAuditContext(ctx.req) });
      }
      return { success: true, message: "Signed in successfully.", data: { user: publicUser(user) } };
    }),
  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie(LMS_SESSION_COOKIE, { ...lmsSessionCookieOptions, maxAge: -1 });
    return { success: true, message: "Signed out successfully.", data: null };
  }),
});
