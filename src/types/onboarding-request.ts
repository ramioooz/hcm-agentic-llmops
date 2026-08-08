import type { OnboardingReviewAction } from './onboarding-review-action';

export type OnboardingRequest = {
  employeeCode: string | null;
  thresholdDays: number;
  requestedAction: OnboardingReviewAction;
  supported: boolean;
};
