import { describe, expect, it } from "vitest";
import { calculateExpiresAt, calculateScore, isExpired, shouldAutoSubmit } from "./assessment";

describe("authoritative attempt policy", () => {
  it("caps the server expiry at the scheduled assessment end", () => { const started = new Date("2030-01-01T10:00:00Z"); const end = new Date("2030-01-01T10:10:00Z"); expect(calculateExpiresAt(started, end, 30)).toEqual(end); });
  it("calculates backend score and applies negative marking only when enabled", () => { const questions = [{ id: 1, correctOptionId: "a", marks: 2, negativeMarks: 0.5 }, { id: 2, correctOptionId: "b", marks: 1, negativeMarks: 0.5 }]; expect(calculateScore(questions, { "1": "a", "2": "a" }, true)).toMatchObject({ score: 1.5 }); expect(calculateScore(questions, { "1": "a", "2": "a" }, false)).toMatchObject({ score: 2 }); });
  it("applies an integrity auto-submit threshold from server policy", () => { expect(shouldAutoSubmit(4, { violationThreshold: 4, autoSubmitOnThreshold: true })).toBe(true); expect(shouldAutoSubmit(4, { violationThreshold: 4, autoSubmitOnThreshold: false })).toBe(false); });
  it("identifies server-expired timestamps", () => { expect(isExpired(new Date(Date.now() - 1000))).toBe(true); });
});
