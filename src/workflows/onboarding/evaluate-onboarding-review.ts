import type { OnboardingReviewAction } from '../../types/onboarding-review-action';

type OnboardingReviewInput = {
  reviewEndDate: string;
  today: string;
  thresholdDays: number;
  requestedAction?: OnboardingReviewAction;
};

type OnboardingReviewResult = {
  daysRemaining: number;
  withinThreshold: boolean;
  action: OnboardingReviewAction;
};

function parseDateOnly(value: string, fieldName: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldName} must be a valid date in YYYY-MM-DD format`);
  }

  const timestamp = Date.parse(`${value}T00:00:00Z`);
  const date = new Date(timestamp);
  const matchesInput =
    date.getUTCFullYear() === Number(value.slice(0, 4)) &&
    date.getUTCMonth() + 1 === Number(value.slice(5, 7)) &&
    date.getUTCDate() === Number(value.slice(8, 10));

  if (!Number.isFinite(timestamp) || !matchesInput) {
    throw new Error(`${fieldName} must be a valid date in YYYY-MM-DD format`);
  }

  return timestamp;
}

export function evaluateOnboardingReview(input: OnboardingReviewInput): OnboardingReviewResult {
  if (!Number.isInteger(input.thresholdDays) || input.thresholdDays < 0) {
    throw new Error('thresholdDays must be a non-negative whole number');
  }

  const end = parseDateOnly(input.reviewEndDate, 'reviewEndDate');
  const today = parseDateOnly(input.today, 'today');
  const daysRemaining = Math.ceil((end - today) / 86_400_000);

  return {
    daysRemaining,
    withinThreshold: daysRemaining >= 0 && daysRemaining <= input.thresholdDays,
    action: input.requestedAction ?? 'REVIEW_ONLY',
  };
}
