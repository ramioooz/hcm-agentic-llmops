import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { buildInvocationResult } from '../../helpers/onboarding-agent.helpers';
import { HCM_INTENT_PROMPT_VERSION } from '../../prompts/normalize-hcm-intent.prompt';
import { enforceIntentConsistency } from '../../security/intent-consistency';
import { redactSensitiveData } from '../../security/pii-redaction';
import { evaluateRequestSafety } from '../../security/request-safety';
import { resolveSafeCorrelationId } from '../../security/correlation-id';
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
import type { ManagerNotificationSender } from '../../types/manager-notification-sender';
import type { OnboardingInvocationInput } from '../../types/onboarding-invocation-input';
import type { OnboardingInvocationResult } from '../../types/onboarding-invocation-result';
import type { SecurityEventRecord } from '../../types/security-event-record';

type GraphRoute = 'CONTINUE' | 'RESPOND' | 'CALCULATE' | 'NOTIFY' | 'SKIP_NOTIFICATION';

export const OnboardingGraphState = Annotation.Root({
  runId: Annotation<string>(),
  route: Annotation<GraphRoute>(),
  lastNode: Annotation<string>(),
  outcomeCode: Annotation<string>(),
});

type ReviewResult = {
  daysRemaining: number;
  withinThreshold: boolean;
  action: 'REVIEW_ONLY' | 'NOTIFY_MANAGER';
};

type ExecutionContext = {
  input: OnboardingInvocationInput;
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
  traceRecorder?: AgentTraceRecorder;
  configuredModel?: string;
};

type EventSink = (event: AgentProgressEvent) => void;

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
    runId,
    correlationId: context.input.correlationId,
  });
}

function toRunStatus(result: OnboardingInvocationResult): AgentInvocationRecord['status'] {
  if (result.body.status === 'COMPLETED') return 'SUCCEEDED';
  if (
    result.body.status === 'UNSUPPORTED_REQUEST' ||
    result.body.status === 'NEED_MORE_INFORMATION' ||
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
    correlationId: context.input.correlationId,
    triggerType: 'HTTP',
    actorEmployeeCode: context.input.actorEmployeeCode,
    intent: intent?.intent === 'ONBOARDING_REVIEW' ? 'ONBOARDING_REVIEW' : undefined,
    requestSummary: intent
      ? redactSensitiveData({
          intent: intent.intent,
          employeeCode: intent.employeeCode,
          thresholdDays: intent.thresholdDays,
          requestedAction: intent.requestedAction,
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

export function createOnboardingGraph(
  dependencies: OnboardingGraphDependencies,
  context: ExecutionContext,
  emit: EventSink,
) {
  const lookup = createEmployeeLookupTool(dependencies.employees);
  const calculate = createOnboardingCalculationTool(dependencies.employees);
  const notify = createManagerNotificationTool(dependencies.employees, dependencies.notifications);

  return new StateGraph(OnboardingGraphState)
    .addNode('request_guard', ({ runId }) => {
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
    .addNode('intent_normalization', async ({ runId }) => {
      try {
        context.intent = enforceIntentConsistency(
          context.input.query,
          await dependencies.normalizer.normalize(context.input.query),
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
          status: context.intent.intent === 'ONBOARDING_REVIEW' ? 'COMPLETED' : 'REJECTED',
          outcomeCode:
            context.intent.intent === 'ONBOARDING_REVIEW'
              ? 'INTENT_NORMALIZED'
              : 'UNSUPPORTED_REQUEST',
          inputData: {
            intent: context.intent.intent,
            employeeCode: context.intent.employeeCode,
            thresholdDays: context.intent.thresholdDays,
            requestedAction: context.intent.requestedAction,
            missingFields: context.intent.missingFields,
          },
        });
        nodeEvent(emit, runId, 'intent_normalization', 'completed', 'INTENT_NORMALIZED');
        return {
          route: 'CONTINUE' as const,
          lastNode: 'intent_normalization',
          outcomeCode: 'INTENT_NORMALIZED',
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
    .addNode('routing', ({ runId }) => {
      const intent = context.intent;
      if (!intent) throw new Error('GRAPH_INTENT_MISSING');
      if (intent.intent === 'UNSUPPORTED') {
        context.result = buildInvocationResult(200, {
          status: 'UNSUPPORTED_REQUEST',
          message: 'That request is outside the capabilities of this HCM agent.',
          runId,
          correlationId: context.input.correlationId,
        });
        nodeEvent(emit, runId, 'routing', 'rejected', 'UNSUPPORTED_REQUEST');
        return {
          route: 'RESPOND' as const,
          lastNode: 'routing',
          outcomeCode: 'UNSUPPORTED_REQUEST',
        };
      }
      if (!intent.employeeCode) {
        context.result = buildInvocationResult(200, {
          status: 'NEED_MORE_INFORMATION',
          message: 'Please provide the employee ID.',
          missingFields: ['employeeId'],
          runId,
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
    .addNode('employee_lookup', async ({ runId }) => {
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
    .addNode('onboarding_calculation', async ({ runId }) => {
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
    .addNode('manager_notification', async ({ runId }) => {
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
    .addNode('response_audit', async ({ runId }) => {
      if (!context.result) {
        if (!context.lookup || !context.review) throw new Error('GRAPH_RESULT_CONTEXT_MISSING');
        const employee = context.lookup.employee;
        context.result = buildInvocationResult(200, {
          status: 'COMPLETED',
          message: 'Employee onboarding review completed.',
          runId,
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
    .addConditionalEdges('routing', (state) =>
      state.route === 'RESPOND' ? 'response_audit' : 'employee_lookup',
    )
    .addConditionalEdges('employee_lookup', (state) =>
      state.route === 'CALCULATE' ? 'onboarding_calculation' : 'response_audit',
    )
    .addConditionalEdges('onboarding_calculation', (state) =>
      state.route === 'NOTIFY' ? 'manager_notification' : 'response_audit',
    )
    .addEdge('manager_notification', 'response_audit')
    .addEdge('response_audit', END)
    .compile();
}

export async function runOnboardingGraph(
  dependencies: OnboardingGraphDependencies,
  input: OnboardingInvocationInput,
  runId: string,
  emit: EventSink = () => undefined,
): Promise<OnboardingInvocationResult> {
  const startedAt = Date.now();
  let normalizedIntent: 'ONBOARDING_REVIEW' | 'UNSUPPORTED' | null = null;
  const nodePath: string[] = [];
  const toolNames: string[] = [];
  let authorizationResult: 'AUTHORIZED' | 'DENIED' | 'NOT_EVALUATED' = 'NOT_EVALUATED';
  const emitEvent: EventSink = (event) => {
    if (event.event === 'intent') normalizedIntent = event.data.intent;
    if (event.event === 'node') nodePath.push(event.data.node);
    if (event.event === 'tool') {
      toolNames.push(event.data.tool);
      nodePath.push(event.data.tool);
      if (event.data.outcomeCode === 'AUTHORIZATION_DENIED') {
        authorizationResult = 'DENIED';
      } else if (event.data.tool === 'employee_lookup' && event.data.status === 'completed') {
        authorizationResult = 'AUTHORIZED';
      }
    }
    emit(event);
  };
  const safeInput = {
    ...input,
    correlationId: resolveSafeCorrelationId(input.correlationId),
  };
  const context: ExecutionContext = {
    input: safeInput,
    actionPerformed: false,
    steps: [],
    securityEvents: [],
  };
  emitEvent({
    event: 'run',
    data: { runId, correlationId: safeInput.correlationId, status: 'started' },
  });
  const graph = createOnboardingGraph(dependencies, context, emitEvent);
  await graph.invoke({ runId, route: 'CONTINUE', lastNode: 'start', outcomeCode: 'RUN_STARTED' });
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
        modelCallCount: nodePath.includes('intent_normalization') ? 1 : 0,
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
