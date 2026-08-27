import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let database: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!database && process.env.DATABASE_URL) {
    database = drizzle(process.env.DATABASE_URL);
  }
  return database;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for OAuth identity sync.");
  const db = await getDb();
  if (!db) return;

  const isOwner = user.openId === ENV.ownerOpenId;
  const values: InsertUser = {
    openId: user.openId,
    name: user.name ?? "Platform user",
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? "manus",
    role: user.role ?? (isOwner ? "SUPER_ADMIN" : "STUDENT"),
    lastSignedIn: user.lastSignedIn ?? new Date(),
  };
  const updateSet = {
    name: values.name,
    email: values.email,
    loginMethod: values.loginMethod,
    lastSignedIn: values.lastSignedIn,
    ...(isOwner ? { role: "SUPER_ADMIN" as const } : {}),
  };
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getUserByLogin(identifier: string) {
  const db = await getDb();
  if (!db) return undefined;
  const email = await db.select().from(users).where(eq(users.email, identifier.toLowerCase())).limit(1);
  if (email[0]) return email[0];
  const username = await db.select().from(users).where(eq(users.username, identifier)).limit(1);
  return username[0];
}

export function publicUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    schoolId: user.schoolId,
    teacherId: user.teacherId,
    status: user.status,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
  };
}
