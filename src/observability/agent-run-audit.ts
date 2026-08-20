import { AgentErrorCode } from '../enums/error.enum';
import { HcmIntentType } from '../enums/hcm-agent.enum';
import { SecurityEventType, SecuritySeverity } from '../enums/security.enum';
import { ApplicationError } from '../errors/application.error';
import { redactSensitiveData } from '../security/pii-redaction';
import type { AgentInvocationRecord } from '../types/agent-invocation-record';
import type { AgentRunRecorder } from '../types/agent-run-recorder';
import type { HcmAgentExecutionContext } from '../types/hcm-agent-execution-context';
import type { OnboardingInvocationInput } from '../types/onboarding-invocation-input';
import type { OnboardingInvocationResult } from '../types/onboarding-invocation-result';

function toRunStatus(result: OnboardingInvocationResult): AgentInvocationRecord['status'] {
  if (result.body.status === 'COMPLETED') return 'SUCCEEDED';
  if (
    result.body.status === 'UNSUPPORTED_REQUEST' ||
    result.body.status === 'NEED_MORE_INFORMATION' ||
    result.body.status === 'AWAITING_APPROVAL' ||
    result.body.status === 'REJECTED' ||
    result.body.code === AgentErrorCode.UnsafeRequestRejected
  ) {
    return 'REJECTED';
  }
  return 'FAILED';
}

export async function recordAgentResult(
  recorder: AgentRunRecorder,
  context: HcmAgentExecutionContext,
): Promise<void> {
  if (!context.result) throw new ApplicationError(AgentErrorCode.GraphResultMissing);
  const intent = context.intent;
  await recorder.recordInvocation({
    runId: context.runId,
    threadId: context.input.threadId,
    correlationId: context.input.correlationId,
    triggerType: context.input.triggerType ?? 'HTTP',
    actorEmployeeCode: context.input.actorEmployeeCode,
    intent:
      intent?.intent === HcmIntentType.OnboardingReview ||
      intent?.intent === HcmIntentType.LeaveRequest
        ? intent.intent
        : undefined,
    requestSummary: intent
      ? redactSensitiveData({
          intent: intent.intent,
          employeeCode: intent.employeeCode,
          thresholdDays: intent.thresholdDays,
          requestedAction: intent.requestedAction,
          ...(intent.intent === HcmIntentType.LeaveRequest
            ? {
                leaveStartDate: intent.leaveStartDate,
                leaveEndDate: intent.leaveEndDate,
              }
            : {}),
          missingFields: intent.missingFields,
        })
      : {},
    status: toRunStatus(context.result),
    resultSummary: redactSensitiveData(context.result.body),
    steps: context.steps.map((step) => ({
      ...step,
      inputData: step.inputData ? redactSensitiveData(step.inputData) : undefined,
      outputData: step.outputData ? redactSensitiveData(step.outputData) : undefined,
    })),
    securityEvents: context.securityEvents.map((event) => ({
      ...event,
      details: event.details ? redactSensitiveData(event.details) : undefined,
    })),
  });
}

export function recordThreadIdentityMismatch(
  recorder: AgentRunRecorder,
  input: OnboardingInvocationInput & { threadId: string },
  runId: string,
  result: OnboardingInvocationResult,
): Promise<void> {
  return recorder.recordInvocation({
    threadId: input.threadId,
    runId,
    correlationId: input.correlationId,
    triggerType: input.triggerType ?? 'HTTP',
    actorEmployeeCode: input.actorEmployeeCode,
    status: 'REJECTED',
    requestSummary: {},
    resultSummary: { status: result.body.status, code: result.body.code },
    steps: [
      {
        stepName: 'thread_identity_check',
        status: 'REJECTED',
        outcomeCode: AgentErrorCode.ThreadIdentityMismatch,
      },
    ],
    securityEvents: [
      { eventType: SecurityEventType.AuthorizationDenied, severity: SecuritySeverity.High },
    ],
  });
}
