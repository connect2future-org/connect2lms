import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseQuestionImportFile } from "./excelTemplates";

describe("canonical Excel templates", () => {
  it("maps the reference MCQ worksheet into assessment builder drafts", async () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["Northstar MCQ template"],
      [],
      ["Question", "Option A", "Option B", "Option C", "Option D", "Correct Option"],
      ["Which planet is known as the Red Planet?", "Earth", "Mars", "Jupiter", "Venus", "B"],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Questions");
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });

    await expect(parseQuestionImportFile(new File([bytes], "questions.xlsx"))).resolves.toEqual([{
      questionText: "Which planet is known as the Red Planet?",
      firstOption: "Earth",
      secondOption: "Mars",
      thirdOption: "Jupiter",
      fourthOption: "Venus",
      correctOption: "b",
    }]);
  });

  it("rejects incomplete question rows with a template-specific message", async () => {
    const worksheet = XLSX.utils.aoa_to_sheet([["Question", "Option A", "Option B", "Option C", "Option D", "Correct Option"], ["Incomplete", "A", "B", "C", "", "A"]]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Questions");
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });

    await expect(parseQuestionImportFile(new File([bytes], "questions.xlsx"))).rejects.toThrow("Question row 2 is incomplete");
  });
});
