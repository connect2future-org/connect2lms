import { describe, expect, it } from "vitest";
import { calculateExpiresAt, calculateScore, getAssessmentAvailability, isExpired } from "./assessment";

describe("assessment engine", () => {
  const questions = [
    { id: 1, correctOptionId: "a", marks: "2.00", negativeMarks: "0.50" },
    { id: 2, correctOptionId: "b", marks: "3.00", negativeMarks: "1.00" },
  ];

  it("calculates marks and negative marks only from authoritative question data", () => {
    expect(calculateScore(questions, { "1": "a", "2": "x" }, true)).toEqual({ score: 1, totalMarks: 5, percentage: 20 });
    expect(calculateScore(questions, { "1": "a", "2": "x" }, false)).toEqual({ score: 2, totalMarks: 5, percentage: 40 });
  });

  it("labels assessment windows for the Student dashboard and start gate", () => { const now = new Date("2026-08-27T10:00:00.000Z"); expect(getAssessmentAvailability(new Date("2026-08-27T09:00:00.000Z"), new Date("2026-08-27T11:00:00.000Z"), now)).toBe("AVAILABLE"); expect(getAssessmentAvailability(new Date("2026-08-27T09:00:00.000Z"), new Date("2026-08-27T10:00:00.000Z"), now)).toBe("EXPIRED"); });

  it("caps the server-controlled expiry at the scheduled assessment end", () => {
    const startedAt = new Date("2026-08-27T10:00:00.000Z");
    const endAt = new Date("2026-08-27T10:20:00.000Z");
    expect(calculateExpiresAt(startedAt, endAt, 45)).toEqual(endAt);
    expect(isExpired(new Date("2026-08-27T10:10:00.000Z"), new Date("2026-08-27T10:10:00.000Z"))).toBe(true);
  });
});
