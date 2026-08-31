import * as XLSX from "xlsx";
import type { AssessmentQuestionDraft } from "./assessmentForm";

export const ROSTER_TEMPLATE_HEADERS = ["Name", "Email", "Username", "Student ID", "USN", "Branch", "Semester", "Section", "Class"] as const;
export const QUESTION_TEMPLATE_HEADERS = ["Question", "Option A", "Option B", "Option C", "Option D", "Correct Option"] as const;
const MAX_BYTES = 10 * 1024 * 1024;

function canonicalHeader(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function downloadWorkbook(filename: string, sheetName: string, rows: Array<Array<string>>) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

export function downloadRosterTemplate() {
  downloadWorkbook("northstar-roster-template.xlsx", "Students", [
    [...ROSTER_TEMPLATE_HEADERS],
    ["Aarav Sharma", "aarav@example.edu", "aarav.sharma", "STU-001", "USN001", "Computer Science", "1", "A", "BSc CS"],
  ]);
}

export function exportTableToExcel(tableName: string, students: Array<{ name?: string | null; email?: string | null; username?: string | null; profile?: { studentId?: string | null; usn?: string | null; branch?: string | null; semester?: string | null; section?: string | null; className?: string | null } }>) {
  const safeName = tableName.trim().replace(/[^a-zA-Z0-9_-]/g, "_") || "student_table";
  const rows: string[][] = [
    [...ROSTER_TEMPLATE_HEADERS],
    ...students.map(s => [
      s.name || "",
      s.email || "",
      s.username || "",
      s.profile?.studentId || "",
      s.profile?.usn || "",
      s.profile?.branch || "",
      s.profile?.semester || "",
      s.profile?.section || "",
      s.profile?.className || "",
    ]),
  ];
  downloadWorkbook(`${safeName}.xlsx`, tableName.slice(0, 30) || "Students", rows);
}

export function downloadQuestionTemplate() {
  downloadWorkbook("northstar-mcq-template.xlsx", "Questions", [
    [...QUESTION_TEMPLATE_HEADERS],
    ["What is 2 + 2?", "3", "4", "5", "6", "B"],
  ]);
}

function readRows(workbook: XLSX.WorkBook) {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The workbook has no worksheet.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName]!, { header: 1, defval: "", raw: false });
  const headerIndex = matrix.findIndex(row => row.filter(Boolean).map(canonicalHeader).some(header => ["question", "questiontext", "mcqquestion"].includes(header)));
  if (headerIndex < 0) throw new Error("Question header not found. Download the MCQ template and keep its header row unchanged.");
  const headers = (matrix[headerIndex] ?? []).map((value, index) => String(value || `Column ${index + 1}`).trim());
  return matrix.slice(headerIndex + 1)
    .map(row => Object.fromEntries(headers.map((header, index) => [canonicalHeader(header), String(row[index] ?? "").trim()])))
    .filter(row => Object.values(row).some(Boolean));
}

function value(row: Record<string, string>, aliases: string[]) {
  const key = aliases.find(alias => row[alias] !== undefined);
  return key ? row[key]!.trim() : "";
}

export async function parseQuestionImportFile(file: File): Promise<AssessmentQuestionDraft[]> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["csv", "xlsx", "xls"].includes(extension)) throw new Error("Please select a CSV, XLSX, or XLS question file.");
  if (!file.size) throw new Error("The selected question file is empty.");
  if (file.size > MAX_BYTES) throw new Error("The selected question file exceeds the 10 MB limit.");
  const workbook = extension === "csv"
    ? XLSX.read(await file.text(), { type: "string" })
    : XLSX.read(await file.arrayBuffer(), { type: "array" });
  const rows = readRows(workbook).map(row => ({
    questionText: value(row, ["question", "questiontext", "mcqquestion"]),
    firstOption: value(row, ["optiona", "a", "choicea"]),
    secondOption: value(row, ["optionb", "b", "choiceb"]),
    thirdOption: value(row, ["optionc", "c", "choicec"]),
    fourthOption: value(row, ["optiond", "d", "choiced"]),
    correctOption: value(row, ["correctoption", "answer", "correctanswer"]).toLowerCase().replace("option ", "").slice(0, 1),
  }));
  const invalidIndex = rows.findIndex(row => !row.questionText || !row.firstOption || !row.secondOption || !row.thirdOption || !row.fourthOption || !["a", "b", "c", "d"].includes(row.correctOption));
  if (invalidIndex >= 0) throw new Error(`Question row ${invalidIndex + 2} is incomplete. Each row needs a question, four options, and Correct Option A, B, C, or D.`);
  if (!rows.length) throw new Error("No question rows were found after the template header.");
  if (rows.length > 100) throw new Error("A question file may contain at most 100 questions.");
  return rows;
}
