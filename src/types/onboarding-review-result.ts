import type { OnboardingReviewAction } from './onboarding-review-action';

export type OnboardingReviewResult = {
  daysRemaining: number;
  withinThreshold: boolean;
  action: OnboardingReviewAction;
};
