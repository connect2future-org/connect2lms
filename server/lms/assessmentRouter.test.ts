import { describe, expect, it } from "vitest";
import { generateHumanCode, normalizeIdentifier, protectAgainstSpreadsheetFormula } from "./utils";
import { selectImportedStudentIds } from "./assessmentRouter";

describe("commercial institution assessment policy helpers", () => {
  it("generates compact upper-case institution and assessment codes", () => { expect(generateHumanCode("Northstar College")).toMatch(/^NORTHS-[A-Z0-9]+$/); });
  it("normalizes credential email identities consistently", () => { expect(normalizeIdentifier("  Admin@College.EDU ")).toBe("admin@college.edu"); });
  it("neutralizes values that spreadsheet programs could interpret as formulas", () => { expect(protectAgainstSpreadsheetFormula("=IMPORTXML(A1)")).toBe("'=IMPORTXML(A1)"); });
  it("normalizes imported publish targets and rejects empty selected targets", () => { expect(selectImportedStudentIds("IMPORTED_ALL", [11, 11, 12])).toEqual([11, 12]); expect(selectImportedStudentIds("IMPORTED_SELECTED", [], [12, 12, 13])).toEqual([12, 13]); expect(() => selectImportedStudentIds("IMPORTED_SELECTED", [], [])).toThrow("SELECT_AT_LEAST_ONE_IMPORTED_STUDENT"); });
});
