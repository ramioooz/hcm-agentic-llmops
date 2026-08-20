import { CommonErrorCode } from '../enums/error.enum';
import { HcmIntentType } from '../enums/hcm-agent.enum';
import { OnboardingReviewAction } from '../enums/onboarding.enum';
import { resolveApplicationErrorCode } from './application-error.helpers';
import type { HcmAgentExecutionContext } from '../types/hcm-agent-execution-context';
import type { HcmIntent } from '../types/hcm-intent';
import type {
  OnboardingInvocationInput,
  TechnicalOnboardingCommand,
  UserOnboardingCommand,
} from '../types/onboarding-invocation-input';
import type { OnboardingInvocationResult } from '../types/onboarding-invocation-result';
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
  const code = resolveApplicationErrorCode(error, CommonErrorCode.InternalError);
  return [
    CommonErrorCode.AuthenticationRequired,
    CommonErrorCode.EmployeeNotFound,
    CommonErrorCode.AuthorizationDenied,
    CommonErrorCode.EmployeeInactive,
    CommonErrorCode.OnboardingReviewNotFound,
  ].includes(code as CommonErrorCode)
    ? code
    : CommonErrorCode.InternalError;
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
      intent.requestedAction === OnboardingReviewAction.NotifyManager
        ? OnboardingReviewAction.NotifyManager
        : OnboardingReviewAction.ReviewOnly,
    pendingMissingFields: intent.missingFields,
  };
}
