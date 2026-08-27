import { describe, expect, it } from "vitest";
import { completedAssessmentIds, getStudentAssessmentPresentation } from "./assessmentAvailability";

describe("student assessment card states", () => {
  it("marks a submitted assessment as completed and keeps it closed", () => { const ids = completedAssessmentIds([{ assessmentId: 42, status: "SUBMITTED" }, { assessmentId: 43, status: "IN_PROGRESS" }]); expect(ids.has(42)).toBe(true); expect(ids.has(43)).toBe(false); expect(getStudentAssessmentPresentation("COMPLETED", true)).toMatchObject({ label: "COMPLETED", canStart: false, action: "View result history" }); });

  it("keeps upcoming and expired assigned tests closed", () => {
    expect(getStudentAssessmentPresentation("UPCOMING", true)).toMatchObject({ label: "UPCOMING", canStart: false, action: "Opens when active" });
    expect(getStudentAssessmentPresentation("EXPIRED", false)).toMatchObject({ label: "EXPIRED", canStart: false, action: "Window closed" });
  });

  it("opens only active assigned tests and explains access-code requirements", () => {
    expect(getStudentAssessmentPresentation("AVAILABLE", true)).toMatchObject({ label: "AVAILABLE", detail: "Assigned · Access code required", canStart: true, action: "Open secure gateway" });
    expect(getStudentAssessmentPresentation("AVAILABLE", false).detail).toContain("Ready to start");
  });
});
