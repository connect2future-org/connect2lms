export type AnswerMap = Record<string, string>;

export type ScoringQuestion = {
  id: number;
  correctOptionId: string;
  marks: string | number;
  negativeMarks: string | number;
};

export function calculateScore(questions: ScoringQuestion[], answers: AnswerMap, negativeMarking: boolean) {
  const totalMarks = questions.reduce((sum, question) => sum + Number(question.marks), 0);
  const score = questions.reduce((sum, question) => {
    const answer = answers[String(question.id)];
    if (!answer) return sum;
    if (answer === question.correctOptionId) return sum + Number(question.marks);
    return negativeMarking ? sum - Number(question.negativeMarks) : sum;
  }, 0);
  return {
    score: Math.max(0, Number(score.toFixed(2))),
    totalMarks,
    percentage: totalMarks === 0 ? 0 : Number(((Math.max(0, score) / totalMarks) * 100).toFixed(2)),
  };
}

export function calculateExpiresAt(startedAt: Date, endAt: Date, durationMinutes: number) {
  const durationDeadline = new Date(startedAt.getTime() + durationMinutes * 60_000);
  return durationDeadline < endAt ? durationDeadline : endAt;
}

export function isExpired(expiresAt: Date, now = new Date()) {
  return now.getTime() >= expiresAt.getTime();
}

export function getAssessmentAvailability(startAt: Date, endAt: Date, now = new Date()) {
  if (endAt.getTime() <= now.getTime()) return "EXPIRED" as const;
  if (startAt.getTime() > now.getTime()) return "UPCOMING" as const;
  return "AVAILABLE" as const;
}

export function shouldAutoSubmit(violationCount: number, policy: Record<string, unknown>) {
  return Boolean(policy.autoSubmitOnThreshold) && violationCount >= Number(policy.violationThreshold ?? 5);
}
