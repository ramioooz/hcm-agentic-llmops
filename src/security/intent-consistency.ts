import type { HcmIntent } from '../types/hcm-intent';

const employeeCodePattern = /\bEMP-\d+\b/gi;
const affirmativeManagerActionPattern =
  /\b(?:(?:notify|message|tell)\s+(?:(?:the|my|their|his|her)\s+)?manager|send\s+(?:a\s+)?(?:message|notification)\s+to\s+(?:(?:the|my|their|his|her)\s+)?manager)\b/i;
const negatedNotificationPattern =
  /\b(?:do\s+not|don't|never|without|no)\s+(?:\w+\s+){0,3}(?:notify|notification|message|send|tell)\b/i;

function hasExplicitEmployeeCode(query: string, employeeCode: string): boolean {
  const explicitCodes = query.match(employeeCodePattern) ?? [];
  return explicitCodes.some((code) => code.toUpperCase() === employeeCode.toUpperCase());
}

function hasExplicitNotificationRequest(query: string): boolean {
  if (negatedNotificationPattern.test(query)) {
    return false;
  }

  return affirmativeManagerActionPattern.test(query);
}

export function enforceIntentConsistency(query: string, intent: HcmIntent): HcmIntent {
  if (intent.intent === 'UNSUPPORTED') {
    return intent;
  }

  const employeeCode =
    intent.employeeCode !== null && hasExplicitEmployeeCode(query, intent.employeeCode)
      ? intent.employeeCode
      : null;
  const requestedAction =
    intent.requestedAction === 'NOTIFY_MANAGER' && !hasExplicitNotificationRequest(query)
      ? 'REVIEW_ONLY'
      : intent.requestedAction;

  return {
    ...intent,
    employeeCode,
    requestedAction,
    missingFields: employeeCode === null ? ['employeeId'] : [],
  };
}
