export type AssessmentQuestionDraft = {
  questionText: string;
  firstOption: string;
  secondOption: string;
  thirdOption: string;
  fourthOption: string;
  correctOption: string;
};

export function toAssessmentQuestions(questions: AssessmentQuestionDraft[]) {
  return questions.map(question => ({
    questionText: question.questionText,
    options: [
      { id: "a", text: question.firstOption },
      { id: "b", text: question.secondOption },
      { id: "c", text: question.thirdOption },
      { id: "d", text: question.fourthOption },
    ],
    correctOptionId: question.correctOption,
    marks: 1,
    negativeMarks: 0,
  }));
}
