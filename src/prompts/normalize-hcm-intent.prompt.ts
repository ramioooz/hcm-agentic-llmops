import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

const systemPrompt = `You normalize requests for a human-capital-management onboarding review service.
Return only the structured fields requested by the response schema.
Supported intent: ONBOARDING_REVIEW, which reviews an employee's active onboarding or probationary review period.
All other requests are UNSUPPORTED.
Extract employee codes only when explicitly present in the request and use the exact EMP-<digits> format.
Extract a threshold only when the request explicitly gives a number of days; otherwise use null.
Use NOTIFY_MANAGER only when the request explicitly asks to notify or message a manager; otherwise use null.
For ONBOARDING_REVIEW without an employee code, include employeeId in missingFields. Do not infer data or actions.
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
        requestedAction: null,
        missingFields: [],
      }),
    ),
    new HumanMessage('Notify the manager about EMP-201 probation status.'),
    new AIMessage(
      JSON.stringify({
        intent: 'ONBOARDING_REVIEW',
        employeeCode: 'EMP-201',
        thresholdDays: null,
        requestedAction: 'NOTIFY_MANAGER',
        missingFields: [],
      }),
    ),
    new HumanMessage(query),
  ];
}
