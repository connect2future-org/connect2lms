export type StudentAssessmentStatus = "UPCOMING" | "AVAILABLE" | "EXPIRED";

export function getStudentAssessmentPresentation(status: StudentAssessmentStatus, accessCodeEnabled: boolean) {
  if (status === "UPCOMING") return { label: "UPCOMING", detail: "Assigned · Opens at the scheduled time", action: "Opens when active", canStart: false } as const;
  if (status === "EXPIRED") return { label: "EXPIRED", detail: "Assigned · Assessment window closed", action: "Window closed", canStart: false } as const;
  return { label: "AVAILABLE", detail: accessCodeEnabled ? "Assigned · Access code required" : "Assigned · Ready to start", action: "Open secure gateway", canStart: true } as const;
}
