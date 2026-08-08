import { enforceIntentConsistency } from '../../src/security/intent-consistency';
import type { HcmIntent } from '../../src/types/hcm-intent';

const normalizedNotification: HcmIntent = {
  intent: 'ONBOARDING_REVIEW',
  employeeCode: 'EMP-201',
  thresholdDays: 30,
  requestedAction: 'NOTIFY_MANAGER',
  missingFields: [],
};

describe('enforceIntentConsistency', () => {
  it('removes an employee code that was not explicitly present in the query', () => {
    expect(enforceIntentConsistency('Review EMP-202 onboarding.', normalizedNotification)).toEqual({
      intent: 'ONBOARDING_REVIEW',
      employeeCode: null,
      thresholdDays: 30,
      requestedAction: 'REVIEW_ONLY',
      missingFields: ['employeeId'],
    });
  });

  it('matches the normalized employee code case-insensitively', () => {
    expect(enforceIntentConsistency('Review emp-201 onboarding.', normalizedNotification)).toEqual({
      intent: 'ONBOARDING_REVIEW',
      employeeCode: 'EMP-201',
      thresholdDays: 30,
      requestedAction: 'REVIEW_ONLY',
      missingFields: [],
    });
  });

  it.each([
    'Review EMP-201 and notify the manager.',
    'Review EMP-201 and create a manager notification.',
    'Review EMP-201 and send a reminder to the manager.',
    'Review EMP-201 and tell the manager.',
  ])('retains notification for explicit wording: %s', (query) => {
    expect(enforceIntentConsistency(query, normalizedNotification).requestedAction).toBe(
      'NOTIFY_MANAGER',
    );
  });

  it('does not treat negated notification language as an explicit request', () => {
    expect(
      enforceIntentConsistency(
        'Review EMP-201 onboarding but do not notify the manager.',
        normalizedNotification,
      ).requestedAction,
    ).toBe('REVIEW_ONLY');
  });

  it('does not treat a request for information about a manager as a notification request', () => {
    expect(
      enforceIntentConsistency(
        "Tell me whether EMP-201's manager has reviewed the onboarding status.",
        normalizedNotification,
      ).requestedAction,
    ).toBe('REVIEW_ONLY');
  });
});
