import Papa from "papaparse";
import * as XLSX from "xlsx";
import { ROSTER_TEMPLATE_HEADERS } from "./excelTemplates";

const ACCEPTED_EXTENSIONS = ["csv", "xlsx", "xls"];
const MAX_BYTES = 10 * 1024 * 1024;

function toStringRows(rows: Array<Record<string, unknown>>) {
  return rows
    .map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).trim(), String(value ?? "").trim()])))
    .filter(row => Object.values(row).some(Boolean));
}

function canonicalHeader(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hasCanonicalRosterHeaders(headers: string[]) {
  const available = new Set(headers.map(canonicalHeader));
  return ROSTER_TEMPLATE_HEADERS.every(header => available.has(canonicalHeader(header)));
}

function assertCanonicalRosterRows(rows: Array<Record<string, string>>) {
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const missing = ROSTER_TEMPLATE_HEADERS.filter(header => !headers.some(candidate => canonicalHeader(candidate) === canonicalHeader(header)));
  if (missing.length) throw new Error(`Roster template headers are incomplete. Download the roster template and include: ${missing.join(", ")}.`);
  return rows;
}

function worksheetRows(sheet: XLSX.WorkSheet) {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
  const headerIndex = matrix.findIndex(row => hasCanonicalRosterHeaders(row.filter(Boolean).map(String)));
  if (headerIndex < 0) return [];
  const headerRow = matrix[headerIndex] ?? [];
  const headers = headerRow.map((value, index) => String(value || `Column ${index + 1}`).trim());
  return matrix.slice(headerIndex + 1).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))).filter(row => Object.values(row).some(Boolean));
}

export async function parseStudentImportFile(file: File): Promise<Array<Record<string, string>>> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ACCEPTED_EXTENSIONS.includes(extension)) throw new Error("Please select a CSV, XLSX, or XLS file.");
  if (file.size === 0) throw new Error("The selected file is empty.");
  if (file.size > MAX_BYTES) throw new Error("The selected file exceeds the 10 MB limit.");
  if (extension === "csv") {
    const parsed = Papa.parse<Record<string, string>>(await file.text(), { header: true, skipEmptyLines: "greedy" });
    if (parsed.errors.length) throw new Error(`CSV parsing failed near row ${parsed.errors[0]?.row ?? "unknown"}.`);
    return assertCanonicalRosterRows(toStringRows(parsed.data));
  }
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("The workbook has no worksheet to import.");
  return assertCanonicalRosterRows(toStringRows(worksheetRows(workbook.Sheets[firstSheet]!)));
}
