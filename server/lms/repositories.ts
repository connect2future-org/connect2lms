import { collections, getMongoDb } from "../mongo";
import type { LmsRole, LmsUser, School } from "./types";

export async function findActiveInstitutionByCode(institutionCode: string): Promise<School | null> {
  const db = await getMongoDb(); return collections(db).schools.findOne({ code: institutionCode.trim().toUpperCase(), status: "ACTIVE" });
}

export async function findProvisionedCredentialUser(input: { institutionCode: string; identifier: string; role: Exclude<LmsRole, "SUPER_ADMIN"> }): Promise<LmsUser | null> {
  const db = await getMongoDb(); const c = collections(db); const school = await findActiveInstitutionByCode(input.institutionCode); if (!school) return null; const identifier = input.identifier.trim();
  const escaped = identifier.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
  const direct = await c.users.findOne({ schoolId: school.id, role: input.role, $or: [{ username: { $regex: `^${escaped}$`, $options: "i" } }, { email: identifier.toLowerCase() }] });
  if (direct || input.role !== "STUDENT") return direct;
  const profile = await c.studentProfiles.findOne({ schoolId: school.id, $or: [{ usn: { $regex: `^${escaped}$`, $options: "i" } }, { studentId: { $regex: `^${escaped}$`, $options: "i" } }] });
  return profile ? c.users.findOne({ id: profile.studentUserId, schoolId: school.id, role: "STUDENT" }) : null;
}
