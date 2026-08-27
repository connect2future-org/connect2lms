import Papa from "papaparse";
import * as XLSX from "xlsx";

const ACCEPTED_EXTENSIONS = ["csv", "xlsx", "xls"];
const MAX_BYTES = 10 * 1024 * 1024;

function toStringRows(rows: Array<Record<string, unknown>>) {
  return rows
    .map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim(), String(value ?? "").trim()])))
    .filter(row => Object.values(row).some(Boolean));
}

export async function parseStudentImportFile(file: File): Promise<Array<Record<string, string>>> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ACCEPTED_EXTENSIONS.includes(extension)) throw new Error("Please select a CSV, XLSX, or XLS file.");
  if (file.size === 0) throw new Error("The selected file is empty.");
  if (file.size > MAX_BYTES) throw new Error("The selected file exceeds the 10 MB limit.");
  if (extension === "csv") {
    const parsed = Papa.parse<Record<string, string>>(await file.text(), { header: true, skipEmptyLines: "greedy" });
    if (parsed.errors.length) throw new Error(`CSV parsing failed near row ${parsed.errors[0]?.row ?? "unknown"}.`);
    return toStringRows(parsed.data);
  }
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("The workbook has no worksheet to import.");
  return toStringRows(XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], { defval: "" }));
}
