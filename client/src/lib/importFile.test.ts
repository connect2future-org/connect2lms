import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseStudentImportFile } from "./importFile";

describe("student Excel import parsing", () => {
  it("finds the real header row after a workbook title and preserves common roster aliases", async () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["Student roster export"],
      [],
      ["First Name", "Surname", "Email ID", "Registration Number", "Department"],
      ["Asha", "Rao", "asha@example.edu", "REG-22", "ECE"],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Roster");
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const rows = await parseStudentImportFile(new File([bytes], "roster.xlsx"));
    expect(rows).toEqual([{ "First Name": "Asha", Surname: "Rao", "Email ID": "asha@example.edu", "Registration Number": "REG-22", Department: "ECE" }]);
  });
});
