import { describe, expect, it } from "vitest";
import { importAcademicFields, normalizeImportRows, summarizeImportRows, validateCanonicalRosterRows } from "./importUtils";

describe("student import normalization", () => {
  it("maps aliases and recognizes valid student records", () => {
    const rows = normalizeImportRows([{ "Student Name": "Mira Patel", "Email Address": "Mira@example.edu", USN: "1MS21CS001", Branch: "Computer Science" }]);
    expect(rows[0]).toMatchObject({ name: "Mira Patel", email: "mira@example.edu", username: "mirapatel", usn: "1MS21CS001", valid: true });
  });

  it("preserves all mapped academic fields for confirmation persistence", () => { const row = normalizeImportRows([{ Name: "Mira Patel", Email: "mira@example.edu", USN: "USN-1", Department: "ECE", Semester: "3", Section: "A" }])[0]!; expect(importAcademicFields(row)).toEqual({ studentId: null, usn: "USN-1", branch: "ECE", semester: "3", section: "A", className: null }); });

  it("flags duplicated identity data before confirmation", () => {
    const rows = normalizeImportRows([{ Name: "Mira Patel", Email: "mira@example.edu" }, { Name: "Mira R.", Email: "mira@example.edu" }]);
    expect(rows[1]?.valid).toBe(false);
    expect(rows[1]?.errors.join(" ")).toContain("Duplicate");
  });

  it("neutralizes formula-like spreadsheet values instead of preserving executable prefixes", () => {
    const rows = normalizeImportRows([{ Name: "=HYPERLINK(\"https://malicious.example\")", Email: "mira@example.edu" }]);
    expect(rows[0]?.name.startsWith("'=HYPERLINK")).toBe(true);
  });

  it("accepts the canonical roster template headers", () => { expect(validateCanonicalRosterRows([{ Name: "Mira", Email: "mira@example.edu", USN: "USN-1", Branch: "ECE", Semester: "3", Section: "A" }])).toHaveLength(1); });

  it("counts institution-scoped duplicate identity conflicts in the preview summary", () => {
    const rows = normalizeImportRows([{ Name: "Mira Patel", Email: "mira@example.edu" }]);
    rows[0]!.errors.push("Identity already exists elsewhere in this institution."); rows[0]!.valid = false;
    expect(summarizeImportRows(rows)).toMatchObject({ total: 1, invalid: 1, duplicates: 1 });
  });

  it("rejects alias-only headers in strict template validation", () => { expect(() => validateCanonicalRosterRows([{ "Student Name": "Asha", "Email ID": "asha@example.edu" }])).toThrow("ROSTER_TEMPLATE_HEADERS_REQUIRED"); });

  it("combines first and last name columns and accepts common roster aliases", () => {
    const rows = normalizeImportRows([{ "First Name": "Asha", Surname: "Rao", "Email ID": "asha@example.edu", USN: "REG-22", Department: "ECE" }]);
    expect(rows[0]).toMatchObject({ name: "Asha Rao", email: "asha@example.edu", usn: "REG-22", branch: "ECE", username: "asharao", valid: true });
  });
});
