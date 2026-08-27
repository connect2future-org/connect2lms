import { describe, expect, it } from "vitest";
import { shouldAutoSubmit } from "./assessment";

describe("integrity policy", () => {
  it("submits only after the configured threshold when auto-submit is enabled", () => {
    const policy = { violationThreshold: 3, autoSubmitOnThreshold: true };
    expect(shouldAutoSubmit(2, policy)).toBe(false);
    expect(shouldAutoSubmit(3, policy)).toBe(true);
  });

  it("never auto-submits solely from count when the policy disables that action", () => {
    expect(shouldAutoSubmit(99, { violationThreshold: 3, autoSubmitOnThreshold: false })).toBe(false);
  });
});
