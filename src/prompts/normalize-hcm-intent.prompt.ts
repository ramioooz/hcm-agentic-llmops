import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { OnboardingReviewAction } from '../enums/onboarding.enum';

export const HCM_INTENT_PROMPT_VERSION = 'hcm-intent-v3';

const systemPrompt = `You normalize requests for a human-capital-management service.
Return only the structured fields requested by the response schema.
Supported intents:
- ONBOARDING_REVIEW reviews an employee's active onboarding or probationary review period.
- LEAVE_REQUEST prepares an annual-leave proposal for an explicit ISO date range without creating a request.
All other requests are UNSUPPORTED.
Extract employee codes only when explicitly present in the request and use the exact EMP-<digits> format.
Extract a numeric day threshold when explicitly stated.
When no day threshold is stated, use 30 for ONBOARDING_REVIEW.
Use ${OnboardingReviewAction.ReviewOnly} unless the request explicitly asks to notify or message a manager.
Use ${OnboardingReviewAction.NotifyManager} only when the request explicitly asks to notify or message a manager.
For ONBOARDING_REVIEW with an explicit first-person target such as "my onboarding status", use null for employeeCode and do not include employeeId in missingFields; the application resolves the authenticated actor deterministically.
For ONBOARDING_REVIEW with neither an employee code nor an explicit first-person target, use null for employeeCode and include employeeId in missingFields.
Never invent employee identifiers or notification actions.
For LEAVE_REQUEST, use null for thresholdDays and requestedAction. Extract leaveStartDate and leaveEndDate only as explicit YYYY-MM-DD values; include startDate or endDate in missingFields when absent. The employeeCode may be null because the authenticated actor defaults to themself.
For ONBOARDING_REVIEW and UNSUPPORTED, use null for leaveStartDate and leaveEndDate.
For UNSUPPORTED, use null for employeeCode, thresholdDays, and requestedAction, with an empty missingFields array.`;

export function buildHcmIntentNormalizationMessages(query: string) {
  return [
    new SystemMessage(systemPrompt),
    new HumanMessage('Check onboarding status for EMP-201 within 14 days.'),
    new AIMessage(
      JSON.stringify({
        intent: 'ONBOARDING_REVIEW',
        employeeCode: 'EMP-201',
        thresholdDays: 14,
        requestedAction: OnboardingReviewAction.ReviewOnly,
        leaveStartDate: null,
        leaveEndDate: null,
        missingFields: [],
      }),
    ),
    new HumanMessage('Notify the manager about EMP-201 probation status.'),
    new AIMessage(
      JSON.stringify({
        intent: 'ONBOARDING_REVIEW',
        employeeCode: 'EMP-201',
        thresholdDays: 30,
        requestedAction: OnboardingReviewAction.NotifyManager,
        leaveStartDate: null,
        leaveEndDate: null,
        missingFields: [],
      }),
    ),
    new HumanMessage('Review my onboarding status.'),
    new AIMessage(
      JSON.stringify({
        intent: 'ONBOARDING_REVIEW',
        employeeCode: null,
        thresholdDays: 30,
        requestedAction: OnboardingReviewAction.ReviewOnly,
        leaveStartDate: null,
        leaveEndDate: null,
        missingFields: [],
      }),
    ),
    new HumanMessage('Review the onboarding status.'),
    new AIMessage(
      JSON.stringify({
        intent: 'ONBOARDING_REVIEW',
        employeeCode: null,
        thresholdDays: 30,
        requestedAction: OnboardingReviewAction.ReviewOnly,
        leaveStartDate: null,
        leaveEndDate: null,
        missingFields: ['employeeId'],
      }),
    ),
    new HumanMessage('Request annual leave from 2026-08-14 through 2026-08-18.'),
    new AIMessage(
      JSON.stringify({
        intent: 'LEAVE_REQUEST',
        employeeCode: null,
        thresholdDays: null,
        requestedAction: null,
        leaveStartDate: '2026-08-14',
        leaveEndDate: '2026-08-18',
        missingFields: [],
      }),
    ),
    new HumanMessage(query),
  ];
}
