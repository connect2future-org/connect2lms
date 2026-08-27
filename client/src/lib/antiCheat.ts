export type IntegrityEventType = "TAB_HIDDEN" | "WINDOW_BLUR" | "FULLSCREEN_EXIT" | "COPY" | "PASTE" | "CUT" | "CONTEXT_MENU" | "SHORTCUT";

const FOCUS_LOSS_EVENTS = new Set<IntegrityEventType>(["TAB_HIDDEN", "WINDOW_BLUR"]);

export function integrityWarningMessage(eventType: IntegrityEventType, count: number, autoSubmitted = false, threshold?: number) {
  const label = eventType.replaceAll("_", " ").toLowerCase();
  return autoSubmitted && threshold ? `Integrity violation: ${label}. Violation ${count} reached the limit of ${threshold}; this attempt was auto-submitted.` : `Integrity warning: ${label}. Violation ${count} recorded.`;
}

export function createIntegrityReporter(report: (eventType: IntegrityEventType) => void, dedupeWindowMs = 900) {
  let lastEvent: { type: IntegrityEventType; at: number } | null = null;
  return (eventType: IntegrityEventType) => {
    const now = Date.now();
    const previous = lastEvent;
    const sameFocusLoss = Boolean(previous && FOCUS_LOSS_EVENTS.has(previous.type) && FOCUS_LOSS_EVENTS.has(eventType));
    if (sameFocusLoss && previous && now - previous.at < dedupeWindowMs) return false;
    if (previous?.type === eventType && now - previous.at < dedupeWindowMs) return false;
    lastEvent = { type: eventType, at: now };
    report(eventType);
    return true;
  };
}
