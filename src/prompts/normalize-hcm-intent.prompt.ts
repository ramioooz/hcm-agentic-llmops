import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

export const HCM_INTENT_PROMPT_VERSION = 'hcm-intent-v1';

const systemPrompt = `You normalize requests for a human-capital-management onboarding review service.
Return only the structured fields requested by the response schema.
Supported intent: ONBOARDING_REVIEW, which reviews an employee's active onboarding or probationary review period.
All other requests are UNSUPPORTED.
Extract employee codes only when explicitly present in the request and use the exact EMP-<digits> format.
Extract a numeric day threshold when explicitly stated.
When no day threshold is stated, use 30 for ONBOARDING_REVIEW.
Use REVIEW_ONLY unless the request explicitly asks to notify or message a manager.
Use NOTIFY_MANAGER only when the request explicitly asks to notify or message a manager.
For ONBOARDING_REVIEW without an employee code, include employeeId in missingFields. Do not infer employee identifiers or notification actions.
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
        requestedAction: 'REVIEW_ONLY',
        missingFields: [],
      }),
    ),
    new HumanMessage('Notify the manager about EMP-201 probation status.'),
    new AIMessage(
      JSON.stringify({
        intent: 'ONBOARDING_REVIEW',
        employeeCode: 'EMP-201',
        thresholdDays: 30,
        requestedAction: 'NOTIFY_MANAGER',
        missingFields: [],
      }),
    ),
    new HumanMessage('Review the onboarding status.'),
    new AIMessage(
      JSON.stringify({
        intent: 'ONBOARDING_REVIEW',
        employeeCode: null,
        thresholdDays: 30,
        requestedAction: 'REVIEW_ONLY',
        missingFields: ['employeeId'],
      }),
    ),
    new HumanMessage(query),
  ];
}
