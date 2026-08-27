import { describe, expect, it } from "vitest";
import { generateHumanCode, normalizeIdentifier, protectAgainstSpreadsheetFormula } from "./utils";

describe("commercial institution assessment policy helpers", () => {
  it("generates compact upper-case institution and assessment codes", () => { expect(generateHumanCode("Northstar College")).toMatch(/^NORTHS-[A-Z0-9]+$/); });
  it("normalizes credential email identities consistently", () => { expect(normalizeIdentifier("  Admin@College.EDU ")).toBe("admin@college.edu"); });
  it("neutralizes values that spreadsheet programs could interpret as formulas", () => { expect(protectAgainstSpreadsheetFormula("=IMPORTXML(A1)")).toBe("'=IMPORTXML(A1)"); });
});
