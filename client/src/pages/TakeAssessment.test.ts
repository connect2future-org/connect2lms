import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IntegrityNoticeBanner } from "./TakeAssessment";

describe("Student assessment integrity warning banner", () => {
  it("renders an assertive warning with the current count for a recorded violation", () => {
    const markup = renderToStaticMarkup(createElement(IntegrityNoticeBanner, { notice: { eventType: "TAB_HIDDEN", count: 2, autoSubmitted: false }, threshold: 5 }));

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-live="assertive"');
    expect(markup).toContain("Integrity warning");
    expect(markup).toContain("tab hidden");
    expect(markup).toContain("Violation 2 recorded.");
    expect(markup).toContain("2/5");
  });

  it("retains an explicit threshold auto-submit message in the result state", () => {
    const markup = renderToStaticMarkup(createElement(IntegrityNoticeBanner, { notice: { eventType: "SHORTCUT", count: 5, autoSubmitted: true }, threshold: 5 }));

    expect(markup).toContain("Assessment auto-submitted");
    expect(markup).toContain("reached the limit of 5");
    expect(markup).toContain("5/5");
  });
});
