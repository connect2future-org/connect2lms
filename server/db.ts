import { collections, getMongoDb, nextId } from "./mongo";
import type { LmsUser } from "./lms/types";
import { ENV } from "./_core/env";
import { findProvisionedCredentialUser } from "./lms/repositories";

export async function getDb() { return getMongoDb(); }

export async function upsertUser(input: Partial<LmsUser> & { openId: string }) {
  const db = await getMongoDb(); const c = collections(db); const now = new Date(); const existing = await c.users.findOne({ openId: input.openId });
  if (existing) { await c.users.updateOne({ id: existing.id }, { $set: { name: input.name ?? existing.name, email: input.email ?? existing.email, loginMethod: input.loginMethod ?? existing.loginMethod, lastSignedIn: input.lastSignedIn ?? now, updatedAt: now } }); return; }
  if (input.openId !== ENV.ownerOpenId) return;
  const owner: LmsUser = { id: await nextId(db, "users"), openId: input.openId, name: input.name ?? "Platform owner", email: input.email ?? null, loginMethod: input.loginMethod ?? "manus", username: null, passwordHash: null, role: "SUPER_ADMIN", schoolId: null, teacherId: null, status: "ACTIVE", lastLogin: null, createdAt: now, updatedAt: now, lastSignedIn: input.lastSignedIn ?? now };
  await c.users.insertOne(owner);
}

export async function getUserByOpenId(openId: string) { const db = await getMongoDb(); return collections(db).users.findOne({ openId }); }
export async function getUserById(id: number) { const db = await getMongoDb(); return collections(db).users.findOne({ id }); }
export async function getUserByLogin(identifier: string) { const db = await getMongoDb(); const normalized = identifier.trim().toLowerCase(); return collections(db).users.findOne({ $or: [{ email: normalized }, { username: identifier.trim() }] }); }
export async function getCredentialUser(input: { institutionCode: string; identifier: string; role: Exclude<LmsUser["role"], "SUPER_ADMIN"> }) { return findProvisionedCredentialUser(input); }
export function publicUser(user: LmsUser) { return { id: user.id, name: user.name, email: user.email, username: user.username, role: user.role, schoolId: user.schoolId, teacherId: user.teacherId, status: user.status, lastLogin: user.lastLogin, createdAt: user.createdAt }; }
