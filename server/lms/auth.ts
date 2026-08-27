import { jwtVerify, SignJWT } from "jose";
import { parse } from "cookie";
import type { Request } from "express";
import { getUserById } from "../db";
import type { User } from "../../drizzle/schema";

export const LMS_SESSION_COOKIE = "lms_session";

function tokenSecret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 24) throw new Error("JWT_SECRET must be configured with at least 24 characters.");
  return new TextEncoder().encode(value);
}

export async function createLmsSession(user: User) {
  return new SignJWT({ role: user.role, schoolId: user.schoolId ?? null })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(tokenSecret());
}

export async function getLmsSessionUser(req: Request): Promise<User | null> {
  const cookies = parse(req.headers.cookie ?? "");
  const token = cookies[LMS_SESSION_COOKIE];
  if (!token) return null;
  try {
    const verified = await jwtVerify(token, tokenSecret());
    const id = Number(verified.payload.sub);
    if (!Number.isInteger(id) || id < 1) return null;
    const user = await getUserById(id);
    return user?.status === "ACTIVE" ? user : null;
  } catch {
    return null;
  }
}

export const lmsSessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 8 * 60 * 60 * 1000,
  path: "/",
};
