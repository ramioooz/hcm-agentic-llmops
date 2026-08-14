export type OnboardingReviewCandidateReader = {
  findDueOnboardingReviewEmployeeCodes(input: {
    today: string;
    thresholdDays: number;
  }): Promise<string[]>;
};
