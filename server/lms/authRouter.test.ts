import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { LMS_SESSION_COOKIE, getLmsSessionUser } from "./auth";
import type { LmsUser } from "./types";

const mocks = vi.hoisted(() => ({ getCredentialUser: vi.fn(), getDb: vi.fn(), getUserById: vi.fn(), getOrCreateOwnerCredentialUser: vi.fn(), updateOne: vi.fn(), writeAudit: vi.fn(), compare: vi.fn(), verifyOwnerCredentials: vi.fn() }));
vi.mock("../db", () => ({ getCredentialUser: mocks.getCredentialUser, getDb: mocks.getDb, getUserById: mocks.getUserById, getOrCreateOwnerCredentialUser: mocks.getOrCreateOwnerCredentialUser, publicUser: (user: LmsUser) => ({ id: user.id, name: user.name, role: user.role, schoolId: user.schoolId, username: user.username }) }));
vi.mock("../mongo", () => ({ collections: () => ({ users: { updateOne: mocks.updateOne } }) }));
vi.mock("./utils", () => ({ writeAudit: mocks.writeAudit, requestAuditContext: () => ({}) }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("./ownerAuth", () => ({ verifyOwnerCredentials: mocks.verifyOwnerCredentials }));

const { lmsAuthRouter } = await import("./authRouter");
const originalSecret = process.env.JWT_SECRET;
const user: LmsUser = { id: 17, openId: null, name: "Issued Admin", email: "admin@example.edu", loginMethod: "credentials", username: "issued-admin", passwordHash: "$2b$12$ZhODXuWiGCCOeeE2apErMuOPgu97.dFdT7aVYk0U1LCHMPCxqnEk2", role: "ADMIN", schoolId: 4, teacherId: null, status: "ACTIVE", lastLogin: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };

afterEach(() => { process.env.JWT_SECRET = originalSecret; vi.clearAllMocks(); });

describe("auth.login credential session", () => {
  it("issues and resolves a valid institution session with the existing managed secret", async () => {
    process.env.JWT_SECRET = "managed"; mocks.getCredentialUser.mockResolvedValue(user); mocks.getDb.mockResolvedValue({}); mocks.getUserById.mockResolvedValue(user); mocks.updateOne.mockResolvedValue({}); mocks.writeAudit.mockResolvedValue(undefined); mocks.compare.mockResolvedValue(true);
    let cookie = ""; let cookieOptions: Record<string, unknown> = {}; const ctx = { user: null, req: { headers: {}, protocol: "https" } as Request, res: { cookie: (name: string, value: string, options: Record<string, unknown>) => { cookie = `${name}=${value}`; cookieOptions = options; } } as unknown as Response };
    const result = await lmsAuthRouter.createCaller(ctx).login({ role: "ADMIN", institutionCode: "MIIT-GNFEA", identifier: "issued-admin", password: "correct-password" });
    expect(result).toMatchObject({ success: true, data: { user: { id: 17, role: "ADMIN", schoolId: 4 } } }); expect(cookie.startsWith(`${LMS_SESSION_COOKIE}=`)).toBe(true); expect(cookieOptions).toMatchObject({ httpOnly: true, sameSite: "none", secure: true, path: "/" }); await expect(getLmsSessionUser({ headers: { cookie } } as Request)).resolves.toMatchObject({ id: 17, role: "ADMIN", schoolId: 4 });
  });

  it("rejects institution credentials at the owner-only procedure", async () => {
    process.env.JWT_SECRET = "managed"; mocks.verifyOwnerCredentials.mockResolvedValue(false);
    const ctx = { user: null, req: { headers: {}, protocol: "https" } as Request, res: {} as Response };
    await expect(lmsAuthRouter.createCaller(ctx).ownerLogin({ email: "admin@example.edu", password: "issued-password-123" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("issues a Super Admin session through dedicated owner credentials", async () => {
    const owner: LmsUser = { ...user, id: 99, name: "Platform Owner", email: "owner@example.edu", username: null, passwordHash: null, role: "SUPER_ADMIN", schoolId: null };
    process.env.JWT_SECRET = "managed"; mocks.verifyOwnerCredentials.mockResolvedValue(true); mocks.getOrCreateOwnerCredentialUser.mockResolvedValue(owner); mocks.getDb.mockResolvedValue({}); mocks.getUserById.mockResolvedValue(owner); mocks.updateOne.mockResolvedValue({}); mocks.writeAudit.mockResolvedValue(undefined);
    let cookie = ""; const ctx = { user: null, req: { headers: {}, protocol: "https" } as Request, res: { cookie: (name: string, value: string) => { cookie = `${name}=${value}`; } } as unknown as Response };
    const result = await lmsAuthRouter.createCaller(ctx).ownerLogin({ email: "owner@example.edu", password: "owner-password-123" });
    expect(result).toMatchObject({ success: true, data: { user: { id: 99, role: "SUPER_ADMIN" } } }); expect(cookie.startsWith(`${LMS_SESSION_COOKIE}=`)).toBe(true); await expect(getLmsSessionUser({ headers: { cookie } } as Request)).resolves.toMatchObject({ id: 99, role: "SUPER_ADMIN" });
  });
});
