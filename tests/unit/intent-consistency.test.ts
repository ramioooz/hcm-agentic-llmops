import { HcmIntentType } from '../../src/enums/hcm-agent.enum';
import { OnboardingReviewAction } from '../../src/enums/onboarding.enum';
import { enforceIntentConsistency } from '../../src/security/intent-consistency';
import type { HcmIntent } from '../../src/types/hcm-intent';

const normalizedNotification: HcmIntent = {
  intent: HcmIntentType.OnboardingReview,
  employeeCode: 'EMP-201',
  thresholdDays: 30,
  requestedAction: OnboardingReviewAction.NotifyManager,
  missingFields: [],
};

describe('enforceIntentConsistency', () => {
  it('removes an employee code that was not explicitly present in the query', () => {
    expect(enforceIntentConsistency('Review EMP-202 onboarding.', normalizedNotification)).toEqual({
      intent: HcmIntentType.OnboardingReview,
      employeeCode: null,
      thresholdDays: 30,
      requestedAction: OnboardingReviewAction.ReviewOnly,
      missingFields: ['employeeId'],
    });
  });

  it('matches the normalized employee code case-insensitively', () => {
    expect(enforceIntentConsistency('Review emp-201 onboarding.', normalizedNotification)).toEqual({
      intent: HcmIntentType.OnboardingReview,
      employeeCode: 'EMP-201',
      thresholdDays: 30,
      requestedAction: OnboardingReviewAction.ReviewOnly,
      missingFields: [],
    });
  });

  it('uses an explicitly stated threshold instead of a different normalized value', () => {
    expect(
      enforceIntentConsistency('Review EMP-201 within 14 days.', {
        ...normalizedNotification,
        thresholdDays: 365,
      }).thresholdDays,
    ).toBe(14);
  });

  it('uses the default threshold when the model invents one that was not stated', () => {
    expect(
      enforceIntentConsistency('Review EMP-201 onboarding status.', {
        ...normalizedNotification,
        thresholdDays: 365,
      }).thresholdDays,
    ).toBe(30);
  });

  it('does not treat an onboarding-period duration as the warning threshold', () => {
    expect(
      enforceIntentConsistency("Review EMP-201's 90-day probation.", {
        ...normalizedNotification,
        thresholdDays: 90,
      }).thresholdDays,
    ).toBe(30);
  });

  it('uses a qualified warning threshold while ignoring another day duration', () => {
    expect(
      enforceIntentConsistency("Review EMP-201's 90-day probation and warn within 14 days.", {
        ...normalizedNotification,
        thresholdDays: 90,
      }).thresholdDays,
    ).toBe(14);
  });

  it.each([
    'Notify the manager about EMP-201.',
    'Please message her manager about EMP-201.',
    'Review EMP-201 and notify his manager.',
    'Review EMP-201 then tell their manager.',
    'Review EMP-201 and send a message to the manager.',
    'Can you notify the manager about EMP-201?',
    'COULD YOU MESSAGE HER MANAGER about EMP-201?',
    'Would you tell their manager about EMP-201?',
    'Will you send a notification to his manager about EMP-201?',
    'I want you to notify the manager about EMP-201.',
    'I need you to send a message to her manager about EMP-201.',
  ])('retains notification for explicit wording: %s', (query) => {
    expect(enforceIntentConsistency(query, normalizedNotification).requestedAction).toBe(
      OnboardingReviewAction.NotifyManager,
    );
  });

  it.each([
    'Should I notify the manager about EMP-201?',
    'Tell me whether I should notify the manager about EMP-201.',
    'Do I need to notify the manager about EMP-201?',
    'Must I notify the manager about EMP-201?',
    'Is a manager notification required for EMP-201?',
    'Does the manager get a notification for EMP-201?',
    'Tell me whether the manager receives a notification for EMP-201.',
    'Do not notify the manager about EMP-201.',
    'Do not message the manager about EMP-201.',
    'Review the notification policy for EMP-201.',
    'Review EMP-201 and notify me.',
    'Review EMP-201 and create a notification.',
  ])('downgrades informational, negated, or recipient-free wording: %s', (query) => {
    expect(enforceIntentConsistency(query, normalizedNotification).requestedAction).toBe(
      OnboardingReviewAction.ReviewOnly,
    );
  });

  it('corrects a false unsupported result for an explicit annual leave date range', () => {
    expect(
      enforceIntentConsistency('Request annual leave from 2026-08-14 through 2026-08-18', {
        intent: HcmIntentType.Unsupported,
        employeeCode: null,
        thresholdDays: null,
        requestedAction: null,
        missingFields: [],
      }),
    ).toEqual({
      intent: HcmIntentType.LeaveRequest,
      employeeCode: null,
      thresholdDays: null,
      requestedAction: null,
      leaveStartDate: '2026-08-14',
      leaveEndDate: '2026-08-18',
      missingFields: [],
    });
  });
});
