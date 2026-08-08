import type { OnboardingReviewAction } from '../workflows/onboarding/evaluate-onboarding-review';

export type OnboardingRequest = {
  employeeCode: string | null;
  thresholdDays: number;
  requestedAction: OnboardingReviewAction;
  supported: boolean;
};
