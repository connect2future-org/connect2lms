import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { LMS_SESSION_COOKIE } from "./lms/auth";
import type { TrpcContext } from "./_core/context";

describe("auth.logout", () => {
  it("clears the LMS session cookie and returns the standard response envelope", async () => {
    const cleared: Array<{ name: string; options: Record<string, unknown> }> = [];
    const ctx = {
      user: {
        id: 1, openId: "sample-user", name: "Sample User", email: "sample@example.com", loginMethod: "manus",
        username: "sample", passwordHash: null, role: "SUPER_ADMIN", schoolId: null, teacherId: null,
        status: "ACTIVE", lastLogin: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} },
      res: { clearCookie: (name: string, options: Record<string, unknown>) => cleared.push({ name, options }) },
    } as unknown as TrpcContext;
    const result = await appRouter.createCaller(ctx).auth.logout();
    expect(result).toEqual({ success: true, message: "Signed out successfully.", data: null });
    expect(cleared).toHaveLength(1);
    expect(cleared[0]?.name).toBe(LMS_SESSION_COOKIE);
    expect(cleared[0]?.options).toMatchObject({ maxAge: -1, httpOnly: true, sameSite: "none", secure: true, path: "/" });
  });
});
