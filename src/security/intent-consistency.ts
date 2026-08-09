import type { HcmIntent } from '../types/hcm-intent';

const employeeCodePattern = /\bEMP-\d+\b/gi;
const thresholdDaysPatterns = [
  /\bwithin\s+(?:the\s+)?(?:next\s+)?(\d{1,3})[\s-]+days?\b/gi,
  /\bnext\s+(\d{1,3})[\s-]+days?\b/gi,
  /\bthreshold(?:\s+(?:of|is))?\s+(\d{1,3})[\s-]+days?\b/gi,
  /\b(\d{1,3})[\s-]+day\s+(?:warning\s+)?threshold\b/gi,
];
const defaultThresholdDays = 30;
const managerRecipient = String.raw`(?:(?:the|my|their|his|her)\s+)?manager`;
const managerAction = String.raw`(?:(?:notify|message|tell)\s+${managerRecipient}|send\s+(?:a\s+)?(?:message|notification)\s+to\s+${managerRecipient})`;
const imperativeManagerActionPattern = new RegExp(
  String.raw`(?:^|[.!?]\s*|\b(?:and|then)\s+)(?:please\s+)?${managerAction}\b`,
  'i',
);
const systemRequestPattern = new RegExp(
  String.raw`\b(?:can|could|would|will)\s+you\s+(?:please\s+)?${managerAction}\b`,
  'i',
);
const explicitDelegationPattern = new RegExp(
  String.raw`\bi\s+(?:want|need)\s+you\s+to\s+(?:please\s+)?${managerAction}\b`,
  'i',
);
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

  return (
    imperativeManagerActionPattern.test(query) ||
    systemRequestPattern.test(query) ||
    explicitDelegationPattern.test(query)
  );
}

function resolveThresholdDays(query: string): number {
  const explicitThresholds = thresholdDaysPatterns
    .flatMap((pattern) => [...query.matchAll(pattern)].map((match) => Number(match[1])))
    .filter((days) => days >= 1 && days <= 365);
  const uniqueThresholds = [...new Set(explicitThresholds)];

  return uniqueThresholds.length === 1
    ? (uniqueThresholds[0] ?? defaultThresholdDays)
    : defaultThresholdDays;
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
    thresholdDays: resolveThresholdDays(query),
    requestedAction,
    missingFields: employeeCode === null ? ['employeeId'] : [],
  };
}
