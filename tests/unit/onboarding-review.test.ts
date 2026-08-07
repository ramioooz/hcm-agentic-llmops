import { evaluateOnboardingReview } from '../../src/workflows/onboarding/evaluate-onboarding-review';

describe('evaluateOnboardingReview', () => {
  it('flags an active review period inside the configured threshold', () => {
    const result = evaluateOnboardingReview({
      reviewEndDate: '2026-08-21',
      today: '2026-08-07',
      thresholdDays: 30,
    });

    expect(result).toEqual({
      daysRemaining: 14,
      withinThreshold: true,
      action: 'REVIEW_ONLY',
    });
  });

  it('does not request a notification when the user asks for review only', () => {
    const result = evaluateOnboardingReview({
      reviewEndDate: '2026-08-21',
      today: '2026-08-07',
      thresholdDays: 30,
      requestedAction: 'REVIEW_ONLY',
    });

    expect(result.action).toBe('REVIEW_ONLY');
  });

  it('preserves an explicit notification request', () => {
    const result = evaluateOnboardingReview({
      reviewEndDate: '2026-08-21',
      today: '2026-08-07',
      thresholdDays: 30,
      requestedAction: 'NOTIFY_MANAGER',
    });

    expect(result.action).toBe('NOTIFY_MANAGER');
  });

  it('rejects invalid dates and thresholds', () => {
    expect(() =>
      evaluateOnboardingReview({
        reviewEndDate: '2026-02-30',
        today: '2026-08-07',
        thresholdDays: 30,
      }),
    ).toThrow('reviewEndDate must be a valid date');

    expect(() =>
      evaluateOnboardingReview({
        reviewEndDate: '2026-08-21',
        today: '2026-08-07',
        thresholdDays: -1,
      }),
    ).toThrow('thresholdDays must be a non-negative whole number');
  });
});
