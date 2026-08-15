import { HcmIntentType } from '../enums/hcm-agent.enum';
import { OnboardingReviewAction } from '../enums/onboarding.enum';
import type { HcmIntent } from '../types/hcm-intent';

const employeeCodePattern = /\bEMP-\d+\b/gi;
const isoDatePattern = /\b\d{4}-\d{2}-\d{2}\b/g;
const explicitAnnualLeaveRequestPattern = /^\s*(?:please\s+)?request\s+annual\s+leave\b/i;
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
const onboardingSelfReferencePattern =
  /\b(?:my\s+(?:own\s+)?(?:onboarding|probation|review)|(?:onboarding|probation|review)(?:\s+status)?\s+for\s+me)\b/i;

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
  if (intent.intent === HcmIntentType.Unsupported) {
    const explicitDates: string[] = query.match(isoDatePattern) ?? [];
    const explicitEmployeeCodes: string[] = query.match(employeeCodePattern) ?? [];
    const [leaveStartDate, leaveEndDate] = explicitDates;
    if (
      explicitAnnualLeaveRequestPattern.test(query) &&
      explicitDates.length === 2 &&
      explicitEmployeeCodes.length === 0 &&
      leaveStartDate !== undefined &&
      leaveEndDate !== undefined
    ) {
      return {
        intent: HcmIntentType.LeaveRequest,
        employeeCode: null,
        thresholdDays: null,
        requestedAction: null,
        leaveStartDate,
        leaveEndDate,
        missingFields: [],
      };
    }
    return intent;
  }

  if (intent.intent === HcmIntentType.LeaveRequest) {
    const explicitDates: string[] = query.match(isoDatePattern) ?? [];
    const employeeCode =
      intent.employeeCode !== null && hasExplicitEmployeeCode(query, intent.employeeCode)
        ? intent.employeeCode
        : null;
    const leaveStartDate =
      intent.leaveStartDate !== null && explicitDates.includes(intent.leaveStartDate)
        ? intent.leaveStartDate
        : null;
    const leaveEndDate =
      intent.leaveEndDate !== null && explicitDates.includes(intent.leaveEndDate)
        ? intent.leaveEndDate
        : null;
    return {
      ...intent,
      employeeCode,
      leaveStartDate,
      leaveEndDate,
      missingFields: [
        ...(leaveStartDate === null ? (['startDate'] as const) : []),
        ...(leaveEndDate === null ? (['endDate'] as const) : []),
      ],
    };
  }

  const employeeCode =
    intent.employeeCode !== null && hasExplicitEmployeeCode(query, intent.employeeCode)
      ? intent.employeeCode
      : null;
  const explicitSelfReference = onboardingSelfReferencePattern.test(query);
  const requestedAction =
    intent.requestedAction === OnboardingReviewAction.NotifyManager &&
    !hasExplicitNotificationRequest(query)
      ? OnboardingReviewAction.ReviewOnly
      : intent.requestedAction;

  return {
    ...intent,
    employeeCode,
    thresholdDays: resolveThresholdDays(query),
    requestedAction,
    missingFields: employeeCode === null && !explicitSelfReference ? (['employeeId'] as const) : [],
  };
}
