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
      'NOTIFY_MANAGER',
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
      'REVIEW_ONLY',
    );
  });
});
