import type { OnboardingReviewAction } from '../enums/onboarding.enum';

export type OnboardingReviewResult = {
  daysRemaining: number;
  withinThreshold: boolean;
  action: OnboardingReviewAction;
};
