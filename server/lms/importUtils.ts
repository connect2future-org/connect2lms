import { protectAgainstSpreadsheetFormula } from "./utils";

export type ImportRow = {
  rowNumber: number;
  name: string;
  email: string;
  username: string;
  studentId: string;
  usn: string;
  branch: string;
  semester: string;
  section: string;
  className: string;
  errors: string[];
  valid: boolean;
};

export const CANONICAL_ROSTER_HEADERS = ["name", "email", "usn", "branch", "semester", "section"] as const;

const aliases: Record<keyof Omit<ImportRow, "rowNumber" | "errors" | "valid">, string[]> = {
  name: ["name", "studentname", "fullname", "studentfullname", "displayname"],
  email: ["email", "emailaddress", "emailid", "mail"],
  username: ["username", "user", "login", "userid"],
  studentId: ["studentid", "studentnumber", "rollnumber", "rollno", "registrationnumber", "regno"],
  usn: ["usn"],
  branch: ["branch", "department", "course", "program"],
  semester: ["semester", "sem"],
  section: ["section", "sec"],
  className: ["class", "classname", "classsection", "grade"],
};

function canonicalHeader(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readAlias(row: Record<string, string>, names: string[]) {
  const sourceKey = Object.keys(row).find(key => names.includes(canonicalHeader(key)));
  return protectAgainstSpreadsheetFormula(sourceKey ? row[sourceKey] : "");
}

function generatedUsername(name: string, email: string, usn: string) {
  const candidate = (name || usn || email.split("@")[0] || "student").toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return candidate.slice(0, 72) || "student";
}

export function validateCanonicalRosterRows(rows: Array<Record<string, string>>) {
  const available = new Set(Object.keys(rows[0] ?? {}).map(canonicalHeader));
  const missing = CANONICAL_ROSTER_HEADERS.filter(header => !available.has(header));
  if (missing.length) throw new Error(`ROSTER_TEMPLATE_HEADERS_REQUIRED: missing ${missing.join(", ")}. Download the canonical roster template.`);
  return rows;
}

export function normalizeImportRows(rows: Array<Record<string, string>>) {
  const seenEmails = new Set<string>();
  return rows.slice(0, 1000).map((source, index): ImportRow => {
    const base = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, readAlias(source, names)])) as Omit<ImportRow, "rowNumber" | "errors" | "valid">;
    if (!base.name) base.name = [readAlias(source, ["firstname", "givenname"]), readAlias(source, ["lastname", "surname", "familyname"])].filter(Boolean).join(" ");
    base.email = base.email.toLowerCase();
    base.username = generatedUsername(base.name, base.email, base.usn);
    const errors: string[] = [];
    if (base.name.length < 2) errors.push("Name is required and must contain at least two characters.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(base.email)) errors.push("A valid email address is required.");
    if (seenEmails.has(base.email)) errors.push("Duplicate email in this file.");
    if (base.email) seenEmails.add(base.email);
    return { rowNumber: index + 2, ...base, errors, valid: errors.length === 0 };
  });
}

export function summarizeImportRows(rows: ImportRow[]) {
  return {
    total: rows.length,
    valid: rows.filter(row => row.valid).length,
    invalid: rows.filter(row => !row.valid).length,
    existing: rows.filter(row => row.errors.some(error => error.includes("Existing student"))).length,
    duplicates: rows.filter(row => row.errors.some(error => error.includes("Duplicate") || error.includes("elsewhere in this institution") || error.includes("staff account"))).length,
    new: rows.filter(row => row.valid && !row.errors.length).length
  };
}

export const columnMapping = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, names]));

export function importAcademicFields(row: ImportRow) {
  return {
    studentId: row.studentId || null,
    usn: row.usn || null,
    branch: row.branch || null,
    semester: row.semester || null,
    section: row.section || null,
    className: row.className || null,
  };
}
