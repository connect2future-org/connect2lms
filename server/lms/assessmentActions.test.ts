import { describe, expect, it } from "vitest";
import { canEditAssessment, removalAction } from "./assessmentActions";

describe("assessment actions", () => {
  it("allows editing drafts only", () => {
    expect(canEditAssessment("DRAFT")).toBe(true);
    expect(canEditAssessment("PUBLISHED")).toBe(false);
    expect(canEditAssessment("ARCHIVED")).toBe(false);
  });

  it("deletes drafts but archives published or archived records", () => {
    expect(removalAction("DRAFT")).toBe("DELETE");
    expect(removalAction("PUBLISHED")).toBe("ARCHIVE");
    expect(removalAction("ARCHIVED")).toBe("ARCHIVE");
  });
});
