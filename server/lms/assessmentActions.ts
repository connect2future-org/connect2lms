export type AssessmentLifecycleStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export function canEditAssessment(status: AssessmentLifecycleStatus) {
  return status === "DRAFT";
}

export function removalAction(status: AssessmentLifecycleStatus) {
  return status === "DRAFT" ? "DELETE" : "ARCHIVE";
}
