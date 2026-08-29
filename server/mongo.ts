import dns from "node:dns";
import { Collection, Db, MongoClient } from "mongodb";
import type { Assessment, AssessmentAssignment, AssessmentQuestion, Attempt, AuditLog, ImportBatch, IntegrityViolation, LmsUser, School, StudentProfile } from "./lms/types";

// Configure fallback DNS servers (Cloudflare / Google) if local router DNS fails SRV query
try {
  dns.setServers(["8.8.8.8", "1.1.1.1", ...dns.getServers()]);
} catch {
  /* ignore dns set error */
}

export type MongoCollections = {
  users: Collection<LmsUser>; schools: Collection<School>; studentProfiles: Collection<StudentProfile>; assessments: Collection<Assessment>; assessmentQuestions: Collection<AssessmentQuestion>; assessmentAssignments: Collection<AssessmentAssignment>; attempts: Collection<Attempt>; integrityViolations: Collection<IntegrityViolation>; importBatches: Collection<ImportBatch>; auditLogs: Collection<AuditLog>;
};

let client: MongoClient | null = null;
let database: Db | null = null;

export async function getMongoDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI must be configured.");
  if (!database) { client = new MongoClient(uri, { serverSelectionTimeoutMS: 30_000, connectTimeoutMS: 30_000 }); await client.connect(); database = client.db(); }
  return database;
}

export function collections(db: Db): MongoCollections {
  return { users: db.collection<LmsUser>("users"), schools: db.collection<School>("schools"), studentProfiles: db.collection<StudentProfile>("studentProfiles"), assessments: db.collection<Assessment>("assessments"), assessmentQuestions: db.collection<AssessmentQuestion>("assessmentQuestions"), assessmentAssignments: db.collection<AssessmentAssignment>("assessmentAssignments"), attempts: db.collection<Attempt>("attempts"), integrityViolations: db.collection<IntegrityViolation>("integrityViolations"), importBatches: db.collection<ImportBatch>("importBatches"), auditLogs: db.collection<AuditLog>("auditLogs") };
}

export async function nextId(db: Db, collection: string) {
  const result = await db.collection<{ _id: string; value: number }>("counters").findOneAndUpdate({ _id: collection }, { $inc: { value: 1 } }, { upsert: true, returnDocument: "after", includeResultMetadata: true });
  if (!result.value) throw new Error(`Could not allocate an identifier for ${collection}.`);
  return result.value.value;
}

async function dropLegacyIndex<T extends object>(collection: Collection<T>, name: string) {
  const existing = (await collection.listIndexes().toArray()).find(index => index.name === name);
  if (existing) await collection.dropIndex(name);
}

async function ensureOptionalIdentityIndex(collection: Collection<LmsUser>, field: "openId") {
  const name = `${field}_1`;
  const existing = (await collection.listIndexes().toArray()).find(index => index.name === name);
  if (existing && !existing.partialFilterExpression) await collection.dropIndex(name);
  await collection.createIndex({ [field]: 1 }, { name, unique: true, partialFilterExpression: { [field]: { $type: "string" } } });
}

async function ensureScopedCredentialIndex(collection: Collection<LmsUser>, field: "email" | "username") {
  const name = `schoolId_1_${field}_1`;
  await collection.createIndex({ schoolId: 1, [field]: 1 }, { name, unique: true, partialFilterExpression: { schoolId: { $type: "number" }, [field]: { $type: "string" } } });
}

async function ensureNullableScopedIndex<T extends object>(collection: Collection<T>, name: string, key: Record<string, 1>, field: string) {
  const existing = (await collection.listIndexes().toArray()).find(index => index.name === name);
  if (existing && !existing.partialFilterExpression) await collection.dropIndex(name);
  await collection.createIndex(key, { name, unique: true, partialFilterExpression: { [field]: { $type: "string" } } });
}

export async function ensureMongoIndexes(db: Db) {
  const c = collections(db);
  await Promise.all([dropLegacyIndex(c.users, "email_1"), dropLegacyIndex(c.users, "username_1"), dropLegacyIndex(c.attempts, "activeAttemptKey_1")]);
  await Promise.all([ensureOptionalIdentityIndex(c.users, "openId"), ensureScopedCredentialIndex(c.users, "email"), ensureScopedCredentialIndex(c.users, "username")]);
  await Promise.all([
    c.users.createIndex({ id: 1 }, { unique: true }), c.users.createIndex({ schoolId: 1, role: 1 }),
    c.schools.createIndex({ id: 1 }, { unique: true }), c.schools.createIndex({ code: 1 }, { unique: true }),
    c.studentProfiles.createIndex({ id: 1 }, { unique: true }), c.studentProfiles.createIndex({ studentUserId: 1 }, { unique: true }),
    c.assessments.createIndex({ id: 1 }, { unique: true }), c.assessments.createIndex({ schoolId: 1, teacherId: 1, createdAt: -1 }),
    c.assessmentQuestions.createIndex({ assessmentId: 1, position: 1 }, { unique: true }), c.assessmentAssignments.createIndex({ assessmentId: 1, studentId: 1 }, { unique: true }),
    c.attempts.createIndex({ id: 1 }, { unique: true }), c.attempts.createIndex({ assessmentId: 1, studentId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: "IN_PROGRESS" } }), c.attempts.createIndex({ studentId: 1, assessmentId: 1, createdAt: -1 }),
    c.integrityViolations.createIndex({ attemptId: 1, occurredAt: -1 }), c.importBatches.createIndex({ teacherId: 1, createdAt: -1 }), c.auditLogs.createIndex({ schoolId: 1, createdAt: -1 }), c.auditLogs.createIndex({ createdAt: -1 }),
  ]);
  await Promise.all([ensureNullableScopedIndex(c.studentProfiles, "schoolId_1_usn_1", { schoolId: 1, usn: 1 }, "usn"), ensureNullableScopedIndex(c.studentProfiles, "schoolId_1_studentId_1", { schoolId: 1, studentId: 1 }, "studentId"), ensureNullableScopedIndex(c.assessments, "schoolId_1_accessCode_1", { schoolId: 1, accessCode: 1 }, "accessCode")]);
}

export async function closeMongo() { await client?.close(); client = null; database = null; }
