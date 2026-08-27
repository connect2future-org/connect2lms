import { describe, expect, it } from "vitest";
import { toAssessmentQuestions, type AssessmentQuestionDraft } from "./assessmentForm";

const question = (number: number): AssessmentQuestionDraft => ({ questionText: `Question ${number}`, firstOption: "A", secondOption: "B", thirdOption: "C", fourthOption: "D", correctOption: "a" });

describe("repeatable assessment question builder", () => {
  it("serializes every draft question with four options", () => {
    const payload = toAssessmentQuestions([question(1), question(2), question(3)]);
    expect(payload).toHaveLength(3);
    expect(payload[0]).toMatchObject({ questionText: "Question 1", correctOptionId: "a" });
    expect(payload[0]?.options).toHaveLength(4);
    expect(payload[2]?.options.map(option => option.id)).toEqual(["a", "b", "c", "d"]);
  });
});
