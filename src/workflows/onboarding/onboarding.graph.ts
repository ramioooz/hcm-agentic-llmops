import {
  Command,
  END,
  START,
  StateGraph,
  StateSchema,
  UntrackedValue,
  interrupt,
  type BaseCheckpointSaver,
} from '@langchain/langgraph';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { buildInvocationResult } from '../../helpers/onboarding-agent.helpers';
import { generateLeaveRequestPdf } from '../../documents/leave-request-pdf';
import { HCM_INTENT_PROMPT_VERSION } from '../../prompts/normalize-hcm-intent.prompt';
import { enforceIntentConsistency } from '../../security/intent-consistency';
import { redactSensitiveData } from '../../security/pii-redaction';
import { evaluateRequestSafety } from '../../security/request-safety';
import { resolveSafeCorrelationId } from '../../security/correlation-id';
import { resolveThreadId } from '../../security/thread-id';
import {
  createEmployeeLookupTool,
  createManagerNotificationTool,
  createOnboardingCalculationTool,
  type AuthorizedEmployeeLookup,
} from '../../tools/onboarding.tools';
import type { AgentInvocationRecord } from '../../types/agent-invocation-record';
import type { AgentProgressEvent } from '../../types/agent-progress-event';
import type { AgentRunRecorder } from '../../types/agent-run-recorder';
import type { AgentRunStepRecord } from '../../types/agent-run-step-record';
import type { AgentTraceRecorder } from '../../types/agent-trace-recorder';
import type { Clock } from '../../types/clock';
import type { EmployeeReader } from '../../types/employee-reader';
import type { HcmIntent } from '../../types/hcm-intent';
import type { HcmIntentNormalizer } from '../../types/hcm-intent-normalizer';
import type { LeaveReader } from '../../types/leave-reader';
import type { LeaveApprovalStore } from '../../types/leave-approval-store';
import type { ManagerNotificationSender } from '../../types/manager-notification-sender';
import type { OnboardingInvocationInput } from '../../types/onboarding-invocation-input';
import type {
  TechnicalOnboardingCommand,
  UserOnboardingCommand,
} from '../../types/onboarding-invocation-input';
import type { OnboardingInvocationResult } from '../../types/onboarding-invocation-result';
import type { SecurityEventRecord } from '../../types/security-event-record';
import type {
  CanonicalThreadOwner,
  ThreadOwnershipReader,
} from '../../types/thread-ownership-reader';
import { runLeaveWorkerGraph } from '../leave/leave.graph';
import { routeHcmIntent } from '../supervisor/route-hcm-intent';

export const OnboardingGraphState = new StateSchema({
  ownerBindingId: z.string().min(1),
  pendingIntent: z.literal('ONBOARDING_REVIEW').nullable().optional(),
  pendingThresholdDays: z.number().int().min(1).max(365).nullable().optional(),
  pendingRequestedAction: z.enum(['REVIEW_ONLY', 'NOTIFY_MANAGER']).nullable().optional(),
  pendingMissingFields: z.array(z.literal('employeeId')).optional(),
  route: new UntrackedValue(
    z.enum([
      'CONTINUE',
      'RESPOND',
      'CALCULATE',
      'NOTIFY',
      'SKIP_NOTIFICATION',
      'LEAVE',
      'APPROVAL',
    ]),
  ),
  pendingLeaveApproval: z
    .object({
      employeeId: z.string().min(1),
      policyId: z.string().min(1),
      startDate: z.string(),
      endDate: z.string(),
      requestedWorkingDays: z.number().int().min(1),
    })
    .nullable()
    .optional(),
  lastNode: new UntrackedValue(z.string()),
  outcomeCode: new UntrackedValue(z.string()),
});

type ReviewResult = {
  daysRemaining: number;
  withinThreshold: boolean;
  action: 'REVIEW_ONLY' | 'NOTIFY_MANAGER';
};

type ExecutionContext = {
  input: OnboardingInvocationInput & { threadId: string };
  runId: string;
  intent?: HcmIntent;
  lookup?: AuthorizedEmployeeLookup;
  review?: ReviewResult;
  actionPerformed: boolean;
  actionReason?: string;
  result?: OnboardingInvocationResult;
  steps: AgentRunStepRecord[];
  securityEvents: SecurityEventRecord[];
};

export type OnboardingGraphDependencies = {
  employees: EmployeeReader;
  clock: Clock;
  recorder: AgentRunRecorder;
  normalizer: HcmIntentNormalizer;
  notifications: ManagerNotificationSender;
  checkpointer: BaseCheckpointSaver;
  threadOwnership: ThreadOwnershipReader;
  traceRecorder?: AgentTraceRecorder;
  configuredModel?: string;
  leaves?: LeaveReader;
  leaveApprovals?: LeaveApprovalStore;
};

type EventSink = (event: AgentProgressEvent) => void;

function isTechnicalCommand(input: OnboardingInvocationInput): input is TechnicalOnboardingCommand {
  return input.kind === 'ONBOARDING_REVIEW';
}

function isUserCommand(input: OnboardingInvocationInput): input is UserOnboardingCommand {
  return !isTechnicalCommand(input);
}

function safeErrorCode(error: unknown): string {
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

function nodeEvent(
  emit: EventSink,
  runId: string,
  node: string,
  status: 'completed' | 'failed' | 'rejected',
  outcomeCode: string,
): void {
  emit({ event: 'node', data: { runId, node, status, outcomeCode } });
}

function toolEvent(
  emit: EventSink,
  runId: string,
  toolName: 'employee_lookup' | 'onboarding_calculation' | 'manager_notification',
  status: 'completed' | 'failed' | 'skipped',
  outcomeCode: string,
): void {
  emit({ event: 'tool', data: { runId, tool: toolName, status, outcomeCode } });
}

function failureResult(
  context: ExecutionContext,
  runId: string,
  httpStatus: number,
  code: string,
  message: string,
): OnboardingInvocationResult {
  return buildInvocationResult(httpStatus, {
    status: 'FAILED',
    code,
    message,
    threadId: context.input.threadId,
    runId,
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

async function recordResult(
  dependencies: OnboardingGraphDependencies,
  context: ExecutionContext,
  runId: string,
): Promise<void> {
  if (!context.result) throw new Error('GRAPH_RESULT_MISSING');
  const intent = context.intent;
  await dependencies.recorder.recordInvocation({
    runId,
    threadId: context.input.threadId,
    correlationId: context.input.correlationId,
    triggerType: context.input.triggerType ?? 'HTTP',
    actorEmployeeCode: context.input.actorEmployeeCode,
    intent:
      intent?.intent === 'ONBOARDING_REVIEW' || intent?.intent === 'LEAVE_REQUEST'
        ? intent.intent
        : undefined,
    requestSummary: intent
      ? redactSensitiveData({
          intent: intent.intent,
          employeeCode: intent.employeeCode,
          thresholdDays: intent.thresholdDays,
          requestedAction: intent.requestedAction,
          ...(intent.intent === 'LEAVE_REQUEST'
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

function continueNormalizedIntent(
  query: string,
  current: HcmIntent,
  previous: HcmIntent | undefined,
): HcmIntent {
  if (
    previous?.intent !== 'ONBOARDING_REVIEW' ||
    previous.employeeCode !== null ||
    current.intent !== 'UNSUPPORTED'
  ) {
    return current;
  }

  const employeeCode = query.trim().toUpperCase();
  if (!/^EMP-\d+$/.test(employeeCode)) return current;

  return {
    ...previous,
    employeeCode,
    missingFields: [],
  };
}

function pendingIntentFromState(state: {
  pendingIntent?: 'ONBOARDING_REVIEW' | null;
  pendingThresholdDays?: number | null;
  pendingRequestedAction?: 'REVIEW_ONLY' | 'NOTIFY_MANAGER' | null;
  pendingMissingFields?: 'employeeId'[];
}): HcmIntent | undefined {
  if (
    state.pendingIntent !== 'ONBOARDING_REVIEW' ||
    state.pendingThresholdDays == null ||
    state.pendingRequestedAction == null
  ) {
    return undefined;
  }
  return {
    intent: 'ONBOARDING_REVIEW',
    employeeCode: null,
    thresholdDays: state.pendingThresholdDays,
    requestedAction: state.pendingRequestedAction,
    missingFields: state.pendingMissingFields ?? [],
  };
}

function pendingState(intent: HcmIntent): {
  pendingIntent: 'ONBOARDING_REVIEW' | null;
  pendingThresholdDays: number | null;
  pendingRequestedAction: 'REVIEW_ONLY' | 'NOTIFY_MANAGER' | null;
  pendingMissingFields: 'employeeId'[];
} {
  if (intent.intent !== 'ONBOARDING_REVIEW' || intent.employeeCode) {
    return {
      pendingIntent: null,
      pendingThresholdDays: null,
      pendingRequestedAction: null,
      pendingMissingFields: [],
    };
  }
  return {
    pendingIntent: intent.intent,
    pendingThresholdDays: intent.thresholdDays,
    pendingRequestedAction: intent.requestedAction,
    pendingMissingFields: intent.missingFields,
  };
}

async function rejectThreadIdentityMismatch(
  dependencies: OnboardingGraphDependencies,
  input: OnboardingInvocationInput & { threadId: string },
  runId: string,
  owner: CanonicalThreadOwner,
): Promise<OnboardingInvocationResult | undefined> {
  const auditOwner = await dependencies.threadOwnership.findOwnerEmployeeCodeByThreadId(
    input.threadId,
  );
  if (auditOwner !== undefined && auditOwner !== owner.employeeCode) {
    return recordThreadIdentityMismatch(dependencies, input, runId);
  }

  const checkpoint = await dependencies.checkpointer.getTuple({
    configurable: { thread_id: input.threadId },
  });
  const ownerBindingId = checkpoint?.checkpoint.channel_values.ownerBindingId;
  if (ownerBindingId === undefined || ownerBindingId === owner.bindingId) {
    return undefined;
  }

  return recordThreadIdentityMismatch(dependencies, input, runId);
}

async function recordThreadIdentityMismatch(
  dependencies: OnboardingGraphDependencies,
  input: OnboardingInvocationInput & { threadId: string },
  runId: string,
): Promise<OnboardingInvocationResult> {
  const result = buildInvocationResult(403, {
    status: 'FAILED',
    code: 'THREAD_IDENTITY_MISMATCH',
    message: 'This conversation belongs to a different employee identity.',
    threadId: input.threadId,
    runId,
    correlationId: input.correlationId,
  });
  await dependencies.recorder.recordInvocation({
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
        outcomeCode: 'THREAD_IDENTITY_MISMATCH',
      },
    ],
    securityEvents: [{ eventType: 'AUTHORIZATION_DENIED', severity: 'HIGH' }],
  });
  return result;
}

export function createOnboardingGraph(
  dependencies: OnboardingGraphDependencies,
  context: ExecutionContext,
  emit: EventSink,
) {
  const { runId } = context;
  const lookup = createEmployeeLookupTool(dependencies.employees);
  const calculate = createOnboardingCalculationTool(dependencies.employees);
  const notify = createManagerNotificationTool(dependencies.employees, dependencies.notifications);

  return new StateGraph(OnboardingGraphState)
    .addNode('request_guard', () => {
      if (isTechnicalCommand(context.input)) {
        nodeEvent(emit, runId, 'request_guard', 'completed', 'TYPED_COMMAND_ACCEPTED');
        return {
          route: 'CONTINUE' as const,
          lastNode: 'request_guard',
          outcomeCode: 'TYPED_COMMAND_ACCEPTED',
        };
      }
      const safety = evaluateRequestSafety(context.input.query);
      if (!safety.isSafe) {
        const outcomeCode = 'UNSAFE_REQUEST_REJECTED';
        context.steps.push({
          stepName: 'request_guard',
          status: 'REJECTED',
          outcomeCode,
          inputData: { reasonCode: safety.reasonCode },
        });
        context.securityEvents.push({
          eventType: 'UNSAFE_REQUEST_REJECTED',
          severity: 'HIGH',
          details: { reasonCode: safety.reasonCode },
        });
        context.result = failureResult(
          context,
          runId,
          403,
          outcomeCode,
          'The request was rejected because it contains unsafe instructions.',
        );
        nodeEvent(emit, runId, 'request_guard', 'rejected', outcomeCode);
        return { route: 'RESPOND' as const, lastNode: 'request_guard', outcomeCode };
      }
      nodeEvent(emit, runId, 'request_guard', 'completed', 'REQUEST_ACCEPTED');
      return {
        route: 'CONTINUE' as const,
        lastNode: 'request_guard',
        outcomeCode: 'REQUEST_ACCEPTED',
      };
    })
    .addNode('intent_normalization', async (state) => {
      if (isTechnicalCommand(context.input)) {
        context.intent = {
          intent: 'ONBOARDING_REVIEW',
          employeeCode: context.input.targetEmployeeCode,
          thresholdDays: context.input.thresholdDays,
          requestedAction:
            context.input.notificationPolicy === 'NONE' ? 'REVIEW_ONLY' : 'NOTIFY_MANAGER',
          missingFields: [],
        };
        emit({
          event: 'intent',
          data: {
            runId,
            status: 'accepted',
            intent: 'ONBOARDING_REVIEW',
            requestedAction: context.intent.requestedAction,
          },
        });
        context.steps.push({
          stepName: 'command_intake',
          status: 'COMPLETED',
          outcomeCode: 'TYPED_COMMAND_ACCEPTED',
          inputData: {
            intent: context.intent.intent,
            thresholdDays: context.intent.thresholdDays,
            requestedAction: context.intent.requestedAction,
          },
        });
        nodeEvent(emit, runId, 'intent_normalization', 'completed', 'TYPED_COMMAND_ACCEPTED');
        return {
          route: 'CONTINUE' as const,
          lastNode: 'intent_normalization',
          outcomeCode: 'TYPED_COMMAND_ACCEPTED',
        };
      }
      try {
        if (!isUserCommand(context.input)) throw new Error('GRAPH_COMMAND_INVALID');
        context.intent = continueNormalizedIntent(
          context.input.query,
          enforceIntentConsistency(
            context.input.query,
            await dependencies.normalizer.normalize(context.input.query),
          ),
          pendingIntentFromState(state),
        );
        emit({
          event: 'intent',
          data: {
            runId,
            status: 'normalized',
            intent: context.intent.intent,
            requestedAction: context.intent.requestedAction,
          },
        });
        context.steps.push({
          stepName: 'intent_normalization',
          status: context.intent.intent === 'UNSUPPORTED' ? 'REJECTED' : 'COMPLETED',
          outcomeCode:
            context.intent.intent === 'UNSUPPORTED' ? 'UNSUPPORTED_REQUEST' : 'INTENT_NORMALIZED',
          inputData: {
            intent: context.intent.intent,
            employeeCode: context.intent.employeeCode,
            thresholdDays: context.intent.thresholdDays,
            requestedAction: context.intent.requestedAction,
            missingFields: context.intent.missingFields,
            ...(context.intent.intent === 'LEAVE_REQUEST'
              ? {
                  leaveStartDate: context.intent.leaveStartDate,
                  leaveEndDate: context.intent.leaveEndDate,
                }
              : {}),
          },
        });
        nodeEvent(emit, runId, 'intent_normalization', 'completed', 'INTENT_NORMALIZED');
        return {
          route: 'CONTINUE' as const,
          lastNode: 'intent_normalization',
          outcomeCode: 'INTENT_NORMALIZED',
          ...pendingState(context.intent),
        };
      } catch {
        context.steps.push({
          stepName: 'intent_normalization',
          status: 'FAILED',
          outcomeCode: 'MODEL_UNAVAILABLE',
        });
        context.result = failureResult(
          context,
          runId,
          503,
          'MODEL_UNAVAILABLE',
          'The request could not be interpreted at this time.',
        );
        nodeEvent(emit, runId, 'intent_normalization', 'failed', 'MODEL_UNAVAILABLE');
        return {
          route: 'RESPOND' as const,
          lastNode: 'intent_normalization',
          outcomeCode: 'MODEL_UNAVAILABLE',
        };
      }
    })
    .addNode('routing', () => {
      const intent = context.intent;
      if (!intent) throw new Error('GRAPH_INTENT_MISSING');
      const worker = routeHcmIntent(intent);
      if (worker === 'UNSUPPORTED') {
        context.result = buildInvocationResult(200, {
          status: 'UNSUPPORTED_REQUEST',
          message: 'That request is outside the capabilities of this HCM agent.',
          runId,
          threadId: context.input.threadId,
          correlationId: context.input.correlationId,
        });
        nodeEvent(emit, runId, 'routing', 'rejected', 'UNSUPPORTED_REQUEST');
        return {
          route: 'RESPOND' as const,
          lastNode: 'routing',
          outcomeCode: 'UNSUPPORTED_REQUEST',
        };
      }
      if (worker === 'LEAVE' && intent.intent === 'LEAVE_REQUEST') {
        if (!intent.leaveStartDate || !intent.leaveEndDate) {
          context.result = buildInvocationResult(200, {
            status: 'NEED_MORE_INFORMATION',
            message: 'Please provide the leave start and end dates in YYYY-MM-DD format.',
            missingFields: intent.missingFields,
            runId,
            threadId: context.input.threadId,
            correlationId: context.input.correlationId,
          });
          nodeEvent(emit, runId, 'routing', 'rejected', 'LEAVE_DATES_REQUIRED');
          return {
            route: 'RESPOND' as const,
            lastNode: 'routing',
            outcomeCode: 'LEAVE_DATES_REQUIRED',
          };
        }
        nodeEvent(emit, runId, 'routing', 'completed', 'LEAVE_REQUEST_ROUTED');
        return {
          route: 'LEAVE' as const,
          lastNode: 'routing',
          outcomeCode: 'LEAVE_REQUEST_ROUTED',
        };
      }
      if (!intent.employeeCode) {
        context.result = buildInvocationResult(200, {
          status: 'NEED_MORE_INFORMATION',
          message: 'Please provide the employee ID.',
          missingFields: ['employeeId'],
          runId,
          threadId: context.input.threadId,
          correlationId: context.input.correlationId,
        });
        nodeEvent(emit, runId, 'routing', 'rejected', 'EMPLOYEE_ID_REQUIRED');
        return {
          route: 'RESPOND' as const,
          lastNode: 'routing',
          outcomeCode: 'EMPLOYEE_ID_REQUIRED',
        };
      }
      nodeEvent(emit, runId, 'routing', 'completed', 'ONBOARDING_REVIEW_ROUTED');
      return {
        route: 'CONTINUE' as const,
        lastNode: 'routing',
        outcomeCode: 'ONBOARDING_REVIEW_ROUTED',
      };
    })
    .addNode('leave_worker', async () => {
      const intent = context.intent;
      if (
        intent?.intent !== 'LEAVE_REQUEST' ||
        !intent.leaveStartDate ||
        !intent.leaveEndDate ||
        !dependencies.leaves
      ) {
        context.result = failureResult(
          context,
          runId,
          500,
          'INTERNAL_ERROR',
          'The workflow could not be completed.',
        );
        return { route: 'RESPOND' as const };
      }
      const worker = await runLeaveWorkerGraph(
        { employees: dependencies.employees, leaves: dependencies.leaves },
        {
          actorEmployeeCode: context.input.actorEmployeeCode,
          targetEmployeeCode: intent.employeeCode ?? context.input.actorEmployeeCode,
          startDate: intent.leaveStartDate,
          endDate: intent.leaveEndDate,
          today: dependencies.clock.today(),
          threadId: context.input.threadId,
          runId,
          correlationId: context.input.correlationId,
        },
        emit,
      );
      context.result = worker.result;
      context.steps.push(...worker.steps);
      context.securityEvents.push(...worker.securityEvents);
      const outcomeCode =
        typeof worker.result.body.code === 'string'
          ? worker.result.body.code
          : 'LEAVE_PROPOSAL_READY';
      nodeEvent(
        emit,
        runId,
        'leave_worker',
        worker.result.httpStatus >= 400 ? 'failed' : 'completed',
        outcomeCode,
      );
      return worker.approval
        ? {
            route: 'APPROVAL' as const,
            pendingLeaveApproval: worker.approval,
          }
        : { route: 'RESPOND' as const };
    })
    .addNode('leave_approval', async (state) => {
      const pending = state.pendingLeaveApproval;
      if (!pending || !dependencies.leaves || !dependencies.leaveApprovals) {
        context.result = failureResult(
          context,
          runId,
          500,
          'INTERNAL_ERROR',
          'The workflow could not be completed.',
        );
        return { route: 'RESPOND' as const, pendingLeaveApproval: null };
      }
      emit({
        event: 'approval',
        data: { runId, status: 'awaiting', outcomeCode: 'LEAVE_APPROVAL_REQUIRED' },
      });
      const decision = interrupt({
        kind: 'LEAVE_APPROVAL',
        startDate: pending.startDate,
        endDate: pending.endDate,
        requestedWorkingDays: pending.requestedWorkingDays,
      });
      if (decision !== 'APPROVE' && decision !== 'REJECT') {
        throw new Error('INVALID_APPROVAL_DECISION');
      }
      if (decision === 'REJECT') {
        context.steps.push({
          stepName: 'leave_approval',
          status: 'REJECTED',
          outcomeCode: 'LEAVE_REQUEST_REJECTED',
        });
        context.result = buildInvocationResult(200, {
          status: 'REJECTED',
          code: 'LEAVE_REQUEST_REJECTED',
          message: 'The leave request proposal was rejected; no request was created.',
          threadId: context.input.threadId,
          runId,
          correlationId: context.input.correlationId,
        });
        emit({
          event: 'approval',
          data: { runId, status: 'rejected', outcomeCode: 'LEAVE_REQUEST_REJECTED' },
        });
        return { route: 'RESPOND' as const, pendingLeaveApproval: null };
      }

      const targetEmployeeCode = await dependencies.leaveApprovals.resolveEmployeeCodeById(
        pending.employeeId,
      );
      if (!targetEmployeeCode) {
        context.result = failureResult(
          context,
          runId,
          404,
          'EMPLOYEE_NOT_FOUND',
          'The employee was not found.',
        );
        return { route: 'RESPOND' as const, pendingLeaveApproval: null };
      }
      const revalidated = await runLeaveWorkerGraph(
        { employees: dependencies.employees, leaves: dependencies.leaves },
        {
          actorEmployeeCode: context.input.actorEmployeeCode,
          targetEmployeeCode,
          startDate: pending.startDate,
          endDate: pending.endDate,
          today: dependencies.clock.today(),
          threadId: context.input.threadId,
          runId,
          correlationId: context.input.correlationId,
        },
        emit,
      );
      if (!revalidated.approval) {
        context.result = buildInvocationResult(409, {
          status: 'FAILED',
          code: 'LEAVE_PROPOSAL_CHANGED',
          message: 'The leave proposal is no longer eligible after revalidation.',
          threadId: context.input.threadId,
          runId,
          correlationId: context.input.correlationId,
        });
        context.steps.push(...revalidated.steps);
        return { route: 'RESPOND' as const, pendingLeaveApproval: null };
      }
      const leaveRequestId = `lr_${createHash('sha256')
        .update(context.input.threadId)
        .digest('hex')
        .slice(0, 24)}`;
      const documentPdf = generateLeaveRequestPdf({
        leaveRequestId,
        employeeCode: targetEmployeeCode,
        leaveType: 'ANNUAL',
        startDate: revalidated.approval.startDate,
        endDate: revalidated.approval.endDate,
        requestedWorkingDays: revalidated.approval.requestedWorkingDays,
      });
      const submitted = await dependencies.leaveApprovals.submitApproved({
        id: leaveRequestId,
        approvalThreadId: context.input.threadId,
        employeeId: revalidated.approval.employeeId,
        employeeCode: targetEmployeeCode,
        policyId: revalidated.approval.policyId,
        startDate: revalidated.approval.startDate,
        endDate: revalidated.approval.endDate,
        requestedWorkingDays: revalidated.approval.requestedWorkingDays,
        documentPdf,
      });
      context.steps.push(...revalidated.steps, {
        stepName: 'leave_approval',
        status: 'COMPLETED',
        outcomeCode: 'LEAVE_REQUEST_SUBMITTED',
      });
      context.result = buildInvocationResult(201, {
        status: 'COMPLETED',
        message: 'The approved leave request was submitted.',
        threadId: context.input.threadId,
        runId,
        correlationId: context.input.correlationId,
        data: {
          leaveRequestId: submitted.id,
          leaveRequestStatus: submitted.status,
          documentUrl: `/api/v1/leave-requests/${submitted.id}/document`,
        },
      });
      emit({
        event: 'approval',
        data: { runId, status: 'approved', outcomeCode: 'LEAVE_REQUEST_SUBMITTED' },
      });
      emit({
        event: 'document',
        data: { runId, status: 'generated', leaveRequestId: submitted.id },
      });
      return { route: 'RESPOND' as const, pendingLeaveApproval: null };
    })
    .addNode('employee_lookup', async () => {
      const employeeCode = context.intent?.employeeCode;
      if (!employeeCode) throw new Error('GRAPH_EMPLOYEE_CODE_MISSING');
      try {
        context.lookup = await lookup.invoke({
          actorEmployeeCode: context.input.actorEmployeeCode,
          targetEmployeeCode: employeeCode,
        });
        context.steps.push({
          stepName: 'employee_lookup',
          status: 'COMPLETED',
          outcomeCode: 'EMPLOYEE_FOUND_AND_AUTHORIZED',
          inputData: { employeeCode },
        });
        toolEvent(emit, runId, 'employee_lookup', 'completed', 'EMPLOYEE_FOUND_AND_AUTHORIZED');
        return {
          route: 'CALCULATE' as const,
          lastNode: 'employee_lookup',
          outcomeCode: 'EMPLOYEE_FOUND_AND_AUTHORIZED',
        };
      } catch (error) {
        const code = safeErrorCode(error);
        const response =
          code === 'AUTHENTICATION_REQUIRED'
            ? ([401, 'Identity was not found.'] as const)
            : code === 'EMPLOYEE_NOT_FOUND'
              ? ([404, `Employee ${employeeCode} was not found.`] as const)
              : code === 'AUTHORIZATION_DENIED'
                ? ([403, 'You are not authorized to perform this operation.'] as const)
                : ([500, 'The workflow could not be completed.'] as const);
        context.steps.push({ stepName: 'employee_lookup', status: 'FAILED', outcomeCode: code });
        if (code === 'AUTHORIZATION_DENIED') {
          context.securityEvents.push({
            eventType: 'AUTHORIZATION_DENIED',
            severity: 'MEDIUM',
          });
        }
        context.result = failureResult(context, runId, response[0], code, response[1]);
        toolEvent(emit, runId, 'employee_lookup', 'failed', code);
        return { route: 'RESPOND' as const, lastNode: 'employee_lookup', outcomeCode: code };
      }
    })
    .addNode('onboarding_calculation', async () => {
      if (!context.lookup || !context.intent || context.intent.intent !== 'ONBOARDING_REVIEW') {
        throw new Error('GRAPH_LOOKUP_MISSING');
      }
      try {
        context.review = await calculate.invoke({
          actorEmployeeCode: context.lookup.actor.employeeCode,
          targetEmployeeCode: context.lookup.employee.employeeCode,
          today: dependencies.clock.today(),
          thresholdDays: context.intent.thresholdDays ?? 30,
          requestedAction: context.intent.requestedAction ?? 'REVIEW_ONLY',
        });
        context.steps.push({
          stepName: 'onboarding_review',
          status: 'COMPLETED',
          outcomeCode: 'REVIEW_EVALUATED',
          outputData: context.review,
        });
        toolEvent(emit, runId, 'onboarding_calculation', 'completed', 'REVIEW_EVALUATED');
        return {
          route:
            context.review.action === 'NOTIFY_MANAGER'
              ? ('NOTIFY' as const)
              : ('SKIP_NOTIFICATION' as const),
          lastNode: 'onboarding_calculation',
          outcomeCode: 'REVIEW_EVALUATED',
        };
      } catch (error) {
        const code = safeErrorCode(error);
        const response =
          code === 'EMPLOYEE_INACTIVE'
            ? ([409, 'The employee is not active.'] as const)
            : code === 'ONBOARDING_REVIEW_NOT_FOUND'
              ? ([404, 'The employee does not have an active onboarding review period.'] as const)
              : ([500, 'The workflow could not be completed.'] as const);
        context.steps.push({ stepName: 'onboarding_review', status: 'FAILED', outcomeCode: code });
        context.result = failureResult(context, runId, response[0], code, response[1]);
        toolEvent(emit, runId, 'onboarding_calculation', 'failed', code);
        return { route: 'RESPOND' as const, lastNode: 'onboarding_calculation', outcomeCode: code };
      }
    })
    .addNode('manager_notification', async () => {
      if (!context.lookup || !context.review) throw new Error('GRAPH_REVIEW_MISSING');
      try {
        const result = await notify.invoke({
          actorEmployeeCode: context.lookup.actor.employeeCode,
          targetEmployeeCode: context.lookup.employee.employeeCode,
          explicit: context.review.action === 'NOTIFY_MANAGER',
          withinThreshold: context.review.withinThreshold,
        });
        context.actionPerformed = result.performed;
        if (!result.performed) context.actionReason = result.reason;
        context.steps.push({
          stepName: 'manager_notification',
          status: result.performed ? 'COMPLETED' : 'REJECTED',
          outcomeCode: result.performed ? 'MANAGER_NOTIFIED' : result.reason,
        });
        toolEvent(
          emit,
          runId,
          'manager_notification',
          result.performed ? 'completed' : 'skipped',
          result.performed ? 'MANAGER_NOTIFIED' : result.reason,
        );
      } catch (error) {
        const code = safeErrorCode(error);
        context.actionReason = code;
        context.steps.push({
          stepName: 'manager_notification',
          status: 'FAILED',
          outcomeCode: code,
        });
        if (code === 'AUTHORIZATION_DENIED') {
          context.securityEvents.push({ eventType: 'AUTHORIZATION_DENIED', severity: 'MEDIUM' });
          context.result = failureResult(
            context,
            runId,
            403,
            code,
            'You are not authorized to perform this operation.',
          );
        } else {
          context.result = failureResult(
            context,
            runId,
            500,
            'INTERNAL_ERROR',
            'The workflow could not be completed.',
          );
        }
        toolEvent(emit, runId, 'manager_notification', 'failed', code);
      }
      return {
        route: 'RESPOND' as const,
        lastNode: 'manager_notification',
        outcomeCode: context.actionReason ?? 'MANAGER_NOTIFIED',
      };
    })
    .addNode('response_audit', async () => {
      if (!context.result) {
        if (!context.lookup || !context.review) throw new Error('GRAPH_RESULT_CONTEXT_MISSING');
        const employee = context.lookup.employee;
        context.result = buildInvocationResult(200, {
          status: 'COMPLETED',
          message: 'Employee onboarding review completed.',
          runId,
          threadId: context.input.threadId,
          correlationId: context.input.correlationId,
          data: {
            employeeCode: employee.employeeCode,
            fullName: employee.fullName,
            reviewEndDate: employee.activeReviewPeriod?.endDate,
            daysRemaining: context.review.daysRemaining,
            withinThreshold: context.review.withinThreshold,
            action: context.review.action,
            actionPerformed: context.actionPerformed,
            ...(context.actionReason ? { actionReason: context.actionReason } : {}),
          },
        });
      }
      try {
        await recordResult(dependencies, context, runId);
      } catch {
        context.result = failureResult(
          context,
          runId,
          500,
          'INTERNAL_ERROR',
          'The workflow could not be completed.',
        );
      }
      emit({
        event: 'response',
        data: { runId, status: 'completed', ...context.result },
      });
      return {
        route: 'RESPOND' as const,
        lastNode: 'response_audit',
        outcomeCode: 'RESPONSE_READY',
      };
    })
    .addEdge(START, 'request_guard')
    .addConditionalEdges('request_guard', (state) =>
      state.route === 'RESPOND' ? 'response_audit' : 'intent_normalization',
    )
    .addConditionalEdges('intent_normalization', (state) =>
      state.route === 'RESPOND' ? 'response_audit' : 'routing',
    )
    .addConditionalEdges('routing', (state) => {
      if (state.route === 'RESPOND') return 'response_audit';
      return state.route === 'LEAVE' ? 'leave_worker' : 'employee_lookup';
    })
    .addConditionalEdges('leave_worker', (state) =>
      state.route === 'APPROVAL' ? 'leave_approval' : 'response_audit',
    )
    .addEdge('leave_approval', 'response_audit')
    .addConditionalEdges('employee_lookup', (state) =>
      state.route === 'CALCULATE' ? 'onboarding_calculation' : 'response_audit',
    )
    .addConditionalEdges('onboarding_calculation', (state) =>
      state.route === 'NOTIFY' ? 'manager_notification' : 'response_audit',
    )
    .addEdge('manager_notification', 'response_audit')
    .addEdge('response_audit', END)
    .compile({ checkpointer: dependencies.checkpointer });
}

export async function runOnboardingGraph(
  dependencies: OnboardingGraphDependencies,
  input: OnboardingInvocationInput,
  runId: string,
  emit: EventSink = () => undefined,
  resumeDecision?: 'APPROVE' | 'REJECT',
): Promise<OnboardingInvocationResult> {
  const startedAt = Date.now();
  let normalizedIntent: 'ONBOARDING_REVIEW' | 'LEAVE_REQUEST' | 'UNSUPPORTED' | null = null;
  const nodePath: string[] = [];
  const toolNames: string[] = [];
  let authorizationResult: 'AUTHORIZED' | 'DENIED' | 'NOT_EVALUATED' = 'NOT_EVALUATED';
  const emitEvent: EventSink = (event) => {
    if (event.event === 'intent') normalizedIntent = event.data.intent;
    if (event.event === 'node') nodePath.push(event.data.node);
    if (event.event === 'approval') nodePath.push(`approval_${event.data.status}`);
    if (event.event === 'document') nodePath.push(`document_${event.data.status}`);
    if (event.event === 'tool') {
      toolNames.push(event.data.tool);
      nodePath.push(event.data.tool);
      if (event.data.outcomeCode === 'AUTHORIZATION_DENIED') {
        authorizationResult = 'DENIED';
      } else if (
        (event.data.tool === 'employee_lookup' ||
          event.data.tool === 'leave_policy_lookup' ||
          event.data.tool === 'leave_balance_lookup') &&
        event.data.status === 'completed'
      ) {
        authorizationResult = 'AUTHORIZED';
      }
    }
    emit(event);
  };
  const safeInput = {
    ...input,
    actorEmployeeCode: input.actorEmployeeCode.trim().toUpperCase(),
    correlationId: resolveSafeCorrelationId(input.correlationId),
    threadId: resolveThreadId(input.threadId),
  } satisfies OnboardingInvocationInput & { threadId: string };
  const context: ExecutionContext = {
    input: safeInput,
    runId,
    actionPerformed: false,
    steps: [],
    securityEvents: [],
  };
  emitEvent({
    event: 'run',
    data: {
      threadId: safeInput.threadId,
      runId,
      correlationId: safeInput.correlationId,
      status: 'started',
      triggerType: safeInput.triggerType ?? 'HTTP',
      ...(isTechnicalCommand(safeInput) ? { eventId: safeInput.eventId } : {}),
    },
  });
  const owner = await dependencies.threadOwnership.resolveCanonicalOwner(
    safeInput.actorEmployeeCode,
  );
  const identityRejection = owner
    ? await rejectThreadIdentityMismatch(dependencies, safeInput, runId, owner)
    : undefined;
  if (identityRejection) {
    context.result = identityRejection;
    emitEvent({
      event: 'response',
      data: { runId, status: 'completed', ...identityRejection },
    });
  } else {
    const existing =
      resumeDecision && dependencies.leaveApprovals
        ? await dependencies.leaveApprovals.findSubmittedByThreadId(safeInput.threadId)
        : undefined;
    if (existing) {
      context.result =
        resumeDecision === 'APPROVE'
          ? buildInvocationResult(200, {
              status: 'COMPLETED',
              message: 'The approved leave request was already submitted.',
              threadId: safeInput.threadId,
              runId,
              correlationId: safeInput.correlationId,
              data: {
                leaveRequestId: existing.id,
                leaveRequestStatus: existing.status,
                documentUrl: `/api/v1/leave-requests/${existing.id}/document`,
              },
            })
          : failureResult(
              context,
              runId,
              409,
              'LEAVE_REQUEST_ALREADY_SUBMITTED',
              'The leave request was already submitted.',
            );
      emitEvent({
        event: 'approval',
        data: {
          runId,
          status: resumeDecision === 'APPROVE' ? 'approved' : 'rejected',
          outcomeCode: 'LEAVE_REQUEST_ALREADY_SUBMITTED',
        },
      });
      emitEvent({
        event: 'document',
        data: { runId, status: 'available', leaveRequestId: existing.id },
      });
      await recordResult(dependencies, context, runId);
      emitEvent({ event: 'response', data: { runId, status: 'completed', ...context.result } });
    } else {
      const graph = createOnboardingGraph(dependencies, context, emitEvent);
      const output = await graph.invoke(
        resumeDecision
          ? new Command({ resume: resumeDecision })
          : { ownerBindingId: owner?.bindingId ?? resolveSafeCorrelationId(undefined) },
        { configurable: { thread_id: safeInput.threadId } },
      );
      const interrupts = (output as Record<string, unknown>).__interrupt__;
      if (Array.isArray(interrupts) && interrupts.length > 0) {
        context.steps.push({
          stepName: 'leave_approval',
          status: 'REJECTED',
          outcomeCode: 'LEAVE_APPROVAL_REQUIRED',
        });
        context.result = buildInvocationResult(202, {
          status: 'AWAITING_APPROVAL',
          code: 'LEAVE_APPROVAL_REQUIRED',
          message: 'Approve or reject the leave request proposal before creation.',
          threadId: safeInput.threadId,
          runId,
          correlationId: safeInput.correlationId,
        });
        await recordResult(dependencies, context, runId);
        emitEvent({ event: 'response', data: { runId, status: 'completed', ...context.result } });
      }
    }
  }
  if (!context.result) throw new Error('GRAPH_RESULT_MISSING');

  if (dependencies.traceRecorder) {
    const failureCode =
      context.result.body.status === 'FAILED'
        ? typeof context.result.body.code === 'string'
          ? context.result.body.code
          : 'INTERNAL_ERROR'
        : null;

    try {
      await dependencies.traceRecorder.record({
        runId,
        correlationId: safeInput.correlationId,
        promptVersion: HCM_INTENT_PROMPT_VERSION,
        configuredModel: dependencies.configuredModel ?? 'unconfigured',
        normalizedIntent,
        nodePath,
        toolNames,
        authorizationResult,
        retryCount: 0,
        modelCallCount:
          !isTechnicalCommand(safeInput) && nodePath.includes('intent_normalization') ? 1 : 0,
        tokenUsage: null,
        latencyMs: Math.max(0, Date.now() - startedAt),
        costUsd: null,
        failureCode,
      });
    } catch {
      // Optional external tracing must never change application behavior.
    }
  }
  return context.result;
}

export function resumeOnboardingGraph(
  dependencies: OnboardingGraphDependencies,
  input: {
    actorEmployeeCode: string;
    correlationId: string;
    threadId: string;
    runId: string;
    decision: 'APPROVE' | 'REJECT';
  },
  emit: EventSink = () => undefined,
): Promise<OnboardingInvocationResult> {
  return runOnboardingGraph(
    dependencies,
    {
      kind: 'USER_QUERY',
      query: '',
      actorEmployeeCode: input.actorEmployeeCode,
      correlationId: input.correlationId,
      threadId: input.threadId,
      runId: input.runId,
      triggerType: 'HTTP',
    },
    input.runId,
    emit,
    input.decision,
  );
}
