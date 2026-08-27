import { randomBytes } from "crypto";
import type { Db } from "mongodb";
import { collections, nextId } from "../mongo";
import type { LmsRole } from "./types";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateHumanCode(prefix: string) { const suffix = Array.from(randomBytes(5), value => ALPHABET[value % ALPHABET.length]).join(""); const safePrefix = prefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "LMS"; return `${safePrefix}-${suffix}`; }
export function normalizeIdentifier(value: string) { return value.trim().toLowerCase(); }
export function protectAgainstSpreadsheetFormula(value: string | undefined | null) { const trimmed = value?.trim() ?? ""; return /^[=+\-@]/.test(trimmed) ? `'${trimmed}` : trimmed; }

export async function writeAudit(db: Db, input: { actorId: number; actorRole: LmsRole; schoolId?: number | null; action: string; targetType: string; targetId?: number | null; metadata?: Record<string, unknown> | null; ip?: string | null; userAgent?: string | null }) {
  const c = collections(db); await c.auditLogs.insertOne({ id: await nextId(db, "auditLogs"), actorId: input.actorId, actorRole: input.actorRole, schoolId: input.schoolId ?? null, action: input.action, targetType: input.targetType, targetId: input.targetId ?? null, metadata: input.metadata ?? null, ip: input.ip ?? null, userAgent: input.userAgent?.slice(0, 512) ?? null, createdAt: new Date() });
}

export function requestAuditContext(req: { ip?: string | undefined; headers: Record<string, unknown> }) { const agent = req.headers["user-agent"]; return { ip: req.ip ?? null, userAgent: typeof agent === "string" ? agent : null }; }

export async function generateAvailableSchoolCode(db: Db, name: string) { const c = collections(db); for (let attempt = 0; attempt < 6; attempt += 1) { const code = generateHumanCode(name); if (!await c.schools.findOne({ code }, { projection: { _id: 1 } })) return code; } throw new Error("Unable to safely generate a unique school code."); }
