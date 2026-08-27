import { describe, expect, it, vi } from "vitest";
import type { LmsUser } from "../lms/types";

const mocks = vi.hoisted(() => ({ getLmsSessionUser: vi.fn(), authenticateRequest: vi.fn() }));
vi.mock("../lms/auth", () => ({ getLmsSessionUser: mocks.getLmsSessionUser }));
vi.mock("./sdk", () => ({ sdk: { authenticateRequest: mocks.authenticateRequest } }));

const { createContext } = await import("./context");
const admin: LmsUser = { id: 17, openId: null, name: "Issued Admin", email: "admin@example.edu", loginMethod: "credentials", username: "issued-admin", passwordHash: "hash", role: "ADMIN", schoolId: 4, teacherId: null, status: "ACTIVE", lastLogin: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };

describe("credential-session context precedence", () => {
  it("uses the verified institution credential session before a Super Admin fallback", async () => {
    mocks.getLmsSessionUser.mockResolvedValue(admin); mocks.authenticateRequest.mockResolvedValue({ role: "SUPER_ADMIN" });
    const ctx = await createContext({ req: { headers: {} }, res: {} } as never);
    expect(ctx.user).toBe(admin); expect(mocks.authenticateRequest).not.toHaveBeenCalled();
  });

  it("does not fall back to a Super Admin identity while credential-session mode is active", async () => {
    mocks.getLmsSessionUser.mockResolvedValue(null); mocks.authenticateRequest.mockResolvedValue({ role: "SUPER_ADMIN" });
    const ctx = await createContext({ req: { headers: { "x-lms-credential-session": "1" } }, res: {} } as never);
    expect(ctx.user).toBeNull(); expect(mocks.authenticateRequest).not.toHaveBeenCalled();
  });
});
