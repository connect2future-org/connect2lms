import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { auditLogs, schools } from "../../drizzle/schema";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateHumanCode(prefix: string) {
  const suffix = Array.from(randomBytes(5), value => ALPHABET[value % ALPHABET.length]).join("");
  const safePrefix = prefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "LMS";
  return `${safePrefix}-${suffix}`;
}

export function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

export function protectAgainstSpreadsheetFormula(value: string | undefined | null) {
  const trimmed = value?.trim() ?? "";
  return /^[=+\-@]/.test(trimmed) ? `'${trimmed}` : trimmed;
}

export async function writeAudit(
  db: Awaited<ReturnType<typeof import("../db").getDb>>,
  input: {
    actorId: number;
    actorRole: "SUPER_ADMIN" | "ADMIN" | "TEACHER" | "STUDENT";
    schoolId?: number | null;
    action: string;
    targetType: string;
    targetId?: string | number | null;
    metadata?: Record<string, unknown> | null;
    ip?: string | null;
    userAgent?: string | null;
  },
) {
  if (!db) return;
  await db.insert(auditLogs).values({
    actorId: input.actorId,
    actorRole: input.actorRole,
    schoolId: input.schoolId ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ? String(input.targetId) : null,
    metadata: input.metadata ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent?.slice(0, 512) ?? null,
  });
}

export function requestAuditContext(req: { ip?: string | undefined; headers: Record<string, unknown> }) {
  const agent = req.headers["user-agent"];
  return {
    ip: req.ip ?? null,
    userAgent: typeof agent === "string" ? agent : null,
  };
}

export async function generateAvailableSchoolCode(db: NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>, name: string) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = generateHumanCode(name);
    const existing = await db.select({ id: schools.id }).from(schools).where(eq(schools.code, code)).limit(1);
    if (!existing[0]) return code;
  }
  throw new Error("Unable to safely generate a unique school code.");
}
