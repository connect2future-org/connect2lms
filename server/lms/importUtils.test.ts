import { describe, expect, it } from "vitest";
import { normalizeImportRows } from "./importUtils";

describe("student import normalization", () => {
  it("maps aliases and recognizes valid student records", () => {
    const rows = normalizeImportRows([{ "Student Name": "Mira Patel", "Email Address": "Mira@example.edu", "Roll Number": "CSE-104", Branch: "Computer Science" }]);
    expect(rows[0]).toMatchObject({ name: "Mira Patel", email: "mira@example.edu", username: "cse-104", studentId: "CSE-104", valid: true });
  });

  it("flags duplicated identity data before confirmation", () => {
    const rows = normalizeImportRows([{ Name: "Mira Patel", Email: "mira@example.edu", Username: "mira" }, { Name: "Mira R.", Email: "mira@example.edu", Username: "mira" }]);
    expect(rows[1]?.valid).toBe(false);
    expect(rows[1]?.errors.join(" ")).toContain("Duplicate");
  });

  it("neutralizes formula-like spreadsheet values instead of preserving executable prefixes", () => {
    const rows = normalizeImportRows([{ Name: "=HYPERLINK(\"https://malicious.example\")", Email: "mira@example.edu", Username: "mira" }]);
    expect(rows[0]?.name.startsWith("'=HYPERLINK")).toBe(true);
  });
});
