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

const aliases: Record<keyof Omit<ImportRow, "rowNumber" | "errors" | "valid">, string[]> = {
  name: ["name", "studentname", "fullname"],
  email: ["email", "emailaddress"],
  username: ["username", "user"],
  studentId: ["studentid", "rollnumber", "rollno"],
  usn: ["usn"],
  branch: ["branch", "department"],
  semester: ["semester", "sem"],
  section: ["section", "sec"],
  className: ["class", "classname", "classname"],
};

function canonicalHeader(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readAlias(row: Record<string, string>, names: string[]) {
  const sourceKey = Object.keys(row).find(key => names.includes(canonicalHeader(key)));
  return protectAgainstSpreadsheetFormula(sourceKey ? row[sourceKey] : "");
}

function generatedUsername(email: string, studentId: string) {
  const candidate = (studentId || email.split("@")[0] || "student").toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return candidate.slice(0, 72) || "student";
}

export function normalizeImportRows(rows: Array<Record<string, string>>) {
  const seenEmails = new Set<string>();
  const seenUsernames = new Set<string>();
  return rows.slice(0, 1000).map((source, index): ImportRow => {
    const base = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, readAlias(source, names)])) as Omit<ImportRow, "rowNumber" | "errors" | "valid">;
    base.email = base.email.toLowerCase();
    base.username = base.username || generatedUsername(base.email, base.studentId || base.usn);
    const errors: string[] = [];
    if (base.name.length < 2) errors.push("Name is required and must contain at least two characters.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(base.email)) errors.push("A valid email address is required.");
    if (!/^[a-zA-Z0-9._-]{3,80}$/.test(base.username)) errors.push("Username must use 3–80 letters, numbers, dots, underscores, or hyphens.");
    if (seenEmails.has(base.email)) errors.push("Duplicate email in this file.");
    if (seenUsernames.has(base.username)) errors.push("Duplicate username in this file.");
    if (base.email) seenEmails.add(base.email);
    if (base.username) seenUsernames.add(base.username);
    return { rowNumber: index + 2, ...base, errors, valid: errors.length === 0 };
  });
}

export function summarizeImportRows(rows: ImportRow[]) {
  return { total: rows.length, valid: rows.filter(row => row.valid).length, invalid: rows.filter(row => !row.valid).length, existing: rows.filter(row => row.errors.some(error => error.startsWith("Existing student"))).length, duplicates: rows.filter(row => row.errors.some(error => error.includes("Duplicate") || error.includes("elsewhere in this institution"))).length, new: rows.filter(row => row.valid && !row.errors.length).length };
}

export const columnMapping = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, names]));
