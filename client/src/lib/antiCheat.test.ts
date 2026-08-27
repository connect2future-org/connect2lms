import { describe, expect, it, vi } from "vitest";
import { createIntegrityReporter, integrityWarningMessage } from "./antiCheat";

describe("client anti-cheat event reporting", () => {
  it("deduplicates paired visibility and blur events in the same browser action", () => {
    vi.useFakeTimers();
    const report = vi.fn();
    const reporter = createIntegrityReporter(report, 900);
    expect(reporter("TAB_HIDDEN")).toBe(true);
    expect(reporter("WINDOW_BLUR")).toBe(false);
    vi.advanceTimersByTime(901);
    expect(reporter("WINDOW_BLUR")).toBe(true);
    expect(report.mock.calls.map(([event]) => event)).toEqual(["TAB_HIDDEN", "WINDOW_BLUR"]);
    vi.useRealTimers();
  });

  it("formats an immediate warning for each violation and threshold auto-submit", () => {
    expect(integrityWarningMessage("TAB_HIDDEN", 2)).toContain("tab hidden");
    expect(integrityWarningMessage("SHORTCUT", 5, true, 5)).toContain("reached the limit of 5");
  });

  it("keeps distinct event types reportable", () => {
    const report = vi.fn();
    const reporter = createIntegrityReporter(report, 900);
    expect(reporter("COPY")).toBe(true);
    expect(reporter("PASTE")).toBe(true);
    expect(reporter("SHORTCUT")).toBe(true);
    expect(report).toHaveBeenCalledTimes(3);
  });
});
