import { HcmIntentType } from '../enums/hcm-agent.enum';
import { OnboardingReviewAction as OnboardingReviewActionValue } from '../enums/onboarding.enum';
import { redactSensitiveData } from '../security/pii-redaction';
import type { AgentInvocationRecord } from '../types/agent-invocation-record';
import type { AgentEventSink } from '../types/agent-event-sink';
import type { HcmAgentExecutionContext } from '../types/hcm-agent-execution-context';
import type { HcmAgentGraphDependencies } from '../types/hcm-agent-graph-dependencies';
import type { HcmIntent } from '../types/hcm-intent';
import type {
  OnboardingInvocationInput,
  TechnicalOnboardingCommand,
  UserOnboardingCommand,
} from '../types/onboarding-invocation-input';
import type { OnboardingInvocationResult } from '../types/onboarding-invocation-result';
import type { OnboardingReviewAction } from '../types/onboarding-review-action';
import { buildInvocationResult } from './onboarding-agent.helpers';

export function isTechnicalCommand(
  input: OnboardingInvocationInput,
): input is TechnicalOnboardingCommand {
  return input.kind === HcmIntentType.OnboardingReview;
}

export function isUserCommand(input: OnboardingInvocationInput): input is UserOnboardingCommand {
  return !isTechnicalCommand(input);
}

export function safeErrorCode(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  return [
    'AUTHENTICATION_REQUIRED',
    'EMPLOYEE_NOT_FOUND',
    'AUTHORIZATION_DENIED',
    'EMPLOYEE_INACTIVE',
    'ONBOARDING_REVIEW_NOT_FOUND',
  ].includes(code)
    ? code
    : 'INTERNAL_ERROR';
}

export function emitNodeEvent(
  emit: AgentEventSink,
  runId: string,
  node: string,
  status: 'completed' | 'failed' | 'rejected',
  outcomeCode: string,
): void {
  emit({ event: 'node', data: { runId, node, status, outcomeCode } });
}

export function emitToolEvent(
  emit: AgentEventSink,
  runId: string,
  toolName: 'employee_lookup' | 'onboarding_calculation' | 'manager_notification',
  status: 'completed' | 'failed' | 'skipped',
  outcomeCode: string,
): void {
  emit({ event: 'tool', data: { runId, tool: toolName, status, outcomeCode } });
}

export function buildFailureResult(
  context: HcmAgentExecutionContext,
  httpStatus: number,
  code: string,
  message: string,
): OnboardingInvocationResult {
  return buildInvocationResult(httpStatus, {
    status: 'FAILED',
    code,
    message,
    threadId: context.input.threadId,
    runId: context.runId,
    correlationId: context.input.correlationId,
  });
}

function toRunStatus(result: OnboardingInvocationResult): AgentInvocationRecord['status'] {
  if (result.body.status === 'COMPLETED') return 'SUCCEEDED';
  if (
    result.body.status === 'UNSUPPORTED_REQUEST' ||
    result.body.status === 'NEED_MORE_INFORMATION' ||
    result.body.status === 'AWAITING_APPROVAL' ||
    result.body.status === 'REJECTED' ||
    result.body.code === 'UNSAFE_REQUEST_REJECTED'
  ) {
    return 'REJECTED';
  }
  return 'FAILED';
}

export async function recordAgentResult(
  dependencies: HcmAgentGraphDependencies,
  context: HcmAgentExecutionContext,
): Promise<void> {
  if (!context.result) throw new Error('GRAPH_RESULT_MISSING');
  const intent = context.intent;
  await dependencies.recorder.recordInvocation({
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

export function resolveAuthenticatedSelfTarget(
  intent: HcmIntent,
  actorEmployeeCode: string,
): HcmIntent {
  if (
    intent.intent !== HcmIntentType.OnboardingReview ||
    intent.employeeCode !== null ||
    intent.missingFields.includes('employeeId')
  ) {
    return intent;
  }
  return { ...intent, employeeCode: actorEmployeeCode };
}

export function continueNormalizedIntent(
  query: string,
  current: HcmIntent,
  previous: HcmIntent | undefined,
): HcmIntent {
  if (
    previous?.intent !== HcmIntentType.OnboardingReview ||
    previous.employeeCode !== null ||
    current.intent !== HcmIntentType.Unsupported
  ) {
    return current;
  }
  const employeeCode = query.trim().toUpperCase();
  if (!/^EMP-\d+$/.test(employeeCode)) return current;
  return { ...previous, employeeCode, missingFields: [] };
}

export function pendingIntentFromState(state: {
  pendingIntent?: HcmIntentType.OnboardingReview | null;
  pendingThresholdDays?: number | null;
  pendingRequestedAction?: OnboardingReviewAction | null;
  pendingMissingFields?: 'employeeId'[];
}): HcmIntent | undefined {
  if (
    state.pendingIntent !== HcmIntentType.OnboardingReview ||
    state.pendingThresholdDays == null ||
    state.pendingRequestedAction == null
  ) {
    return undefined;
  }
  return {
    intent: HcmIntentType.OnboardingReview,
    employeeCode: null,
    thresholdDays: state.pendingThresholdDays,
    requestedAction: state.pendingRequestedAction,
    missingFields: state.pendingMissingFields ?? [],
  };
}

export function pendingState(intent: HcmIntent): {
  pendingIntent: HcmIntentType.OnboardingReview | null;
  pendingThresholdDays: number | null;
  pendingRequestedAction: OnboardingReviewAction | null;
  pendingMissingFields: 'employeeId'[];
} {
  if (intent.intent !== HcmIntentType.OnboardingReview || intent.employeeCode) {
    return {
      pendingIntent: null,
      pendingThresholdDays: null,
      pendingRequestedAction: null,
      pendingMissingFields: [],
    };
  }
  return {
    pendingIntent: HcmIntentType.OnboardingReview,
    pendingThresholdDays: intent.thresholdDays,
    pendingRequestedAction:
      intent.requestedAction === OnboardingReviewActionValue.NotifyManager
        ? OnboardingReviewActionValue.NotifyManager
        : OnboardingReviewActionValue.ReviewOnly,
    pendingMissingFields: intent.missingFields,
  };
}
