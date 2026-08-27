import { afterEach, describe, expect, it } from "vitest";
import { createLmsSession } from "./auth";
import type { LmsUser } from "./types";

const originalSecret = process.env.JWT_SECRET;
const user: LmsUser = { id: 7, openId: null, name: "Institution Admin", email: "admin@example.edu", loginMethod: "credentials", username: "admin", passwordHash: "hash", role: "ADMIN", schoolId: 3, teacherId: null, status: "ACTIVE", lastLogin: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };

afterEach(() => { process.env.JWT_SECRET = originalSecret; });

describe("credential session signing", () => {
  it("creates a signed institution session with the existing non-empty managed secret", async () => { process.env.JWT_SECRET = "managed"; await expect(createLmsSession(user)).resolves.toEqual(expect.any(String)); });
});
