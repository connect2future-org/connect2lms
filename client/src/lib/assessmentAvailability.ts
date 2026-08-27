export type StudentAssessmentStatus = "UPCOMING" | "AVAILABLE" | "EXPIRED" | "COMPLETED";

export function completedAssessmentIds(results: Array<{ assessmentId?: number; status: string }>) {
  return new Set(results.filter(result => Boolean(result.assessmentId) && ["SUBMITTED", "AUTO_SUBMITTED", "EXPIRED"].includes(result.status)).map(result => result.assessmentId as number));
}

export function getStudentAssessmentPresentation(status: StudentAssessmentStatus, accessCodeEnabled: boolean) {
  if (status === "COMPLETED") return { label: "COMPLETED", detail: "Assigned · Attempt submitted and scored", action: "View result history", canStart: false } as const;
  if (status === "UPCOMING") return { label: "UPCOMING", detail: "Assigned · Opens at the scheduled time", action: "Opens when active", canStart: false } as const;
  if (status === "EXPIRED") return { label: "EXPIRED", detail: "Assigned · Assessment window closed", action: "Window closed", canStart: false } as const;
  return { label: "AVAILABLE", detail: accessCodeEnabled ? "Assigned · Access code required" : "Assigned · Ready to start", action: "Open secure gateway", canStart: true } as const;
}
