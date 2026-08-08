import type { OnboardingReviewAction } from './onboarding-review-action';

export type HcmIntent = {
  intent: 'ONBOARDING_REVIEW' | 'UNSUPPORTED';
  employeeCode: string | null;
  thresholdDays: number | null;
  requestedAction: OnboardingReviewAction | null;
  missingFields: string[];
};
