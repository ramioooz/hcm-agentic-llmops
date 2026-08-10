import { Command } from '@langchain/langgraph';
import { HcmIntentType } from '../enums/hcm-agent.enum';
import { LeaveApprovalDecision } from '../enums/leave.enum';
import { createHcmAgentGraph } from '../graphs/hcm-agent.graph';
import { buildInvocationResult } from '../helpers/onboarding-agent.helpers';
import { HCM_INTENT_PROMPT_VERSION } from '../prompts/normalize-hcm-intent.prompt';
import { resolveSafeCorrelationId } from '../security/correlation-id';
import { resolveThreadId } from '../security/thread-id';
import type { AgentEventSink } from '../types/agent-event-sink';
import type { AgentResumeInput } from '../types/agent-resume-input';
import type { HcmAgentExecutionContext } from '../types/hcm-agent-execution-context';
import type { HcmAgentGraphDependencies } from '../types/hcm-agent-graph-dependencies';
import type { OnboardingInvocationInput } from '../types/onboarding-invocation-input';
import type { OnboardingInvocationResult } from '../types/onboarding-invocation-result';
import type { CanonicalThreadOwner } from '../types/thread-ownership-reader';
import {
  buildFailureResult,
  isTechnicalCommand,
  recordAgentResult,
} from '../helpers/hcm-agent.helpers';

async function recordThreadIdentityMismatch(
  dependencies: HcmAgentGraphDependencies,
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

async function rejectThreadIdentityMismatch(
  dependencies: HcmAgentGraphDependencies,
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
  if (ownerBindingId === undefined || ownerBindingId === owner.bindingId) return undefined;
  return recordThreadIdentityMismatch(dependencies, input, runId);
}

export function createHcmAgentGraphForExecution(
  dependencies: HcmAgentGraphDependencies,
  input: OnboardingInvocationInput & { threadId: string },
  runId: string,
  options: { agentServerManagedCheckpointer?: boolean } = {},
) {
  return createHcmAgentGraph(
    dependencies,
    {
      input,
      runId,
      actionPerformed: false,
      steps: [],
      securityEvents: [],
    },
    () => undefined,
    options,
  );
}

export async function runHcmAgentGraph(
  dependencies: HcmAgentGraphDependencies,
  input: OnboardingInvocationInput,
  runId: string,
  emit: AgentEventSink = () => undefined,
  resumeDecision?: AgentResumeInput['decision'],
): Promise<OnboardingInvocationResult> {
  const startedAt = Date.now();
  let normalizedIntent: HcmIntentType | null = null;
  const nodePath: string[] = [];
  const toolNames: string[] = [];
  let authorizationResult: 'AUTHORIZED' | 'DENIED' | 'NOT_EVALUATED' = 'NOT_EVALUATED';
  const emitEvent: AgentEventSink = (event) => {
    if (event.event === 'intent') normalizedIntent = event.data.intent as HcmIntentType;
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
  const context: HcmAgentExecutionContext = {
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
    emitEvent({ event: 'response', data: { runId, status: 'completed', ...identityRejection } });
  } else {
    const existing =
      resumeDecision && dependencies.leaveApprovals
        ? await dependencies.leaveApprovals.findSubmittedByThreadId(safeInput.threadId)
        : undefined;
    if (existing) {
      context.result =
        resumeDecision === LeaveApprovalDecision.Approve
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
          : buildFailureResult(
              context,
              409,
              'LEAVE_REQUEST_ALREADY_SUBMITTED',
              'The leave request was already submitted.',
            );
      emitEvent({
        event: 'approval',
        data: {
          runId,
          status: resumeDecision === LeaveApprovalDecision.Approve ? 'approved' : 'rejected',
          outcomeCode: 'LEAVE_REQUEST_ALREADY_SUBMITTED',
        },
      });
      emitEvent({
        event: 'document',
        data: { runId, status: 'available', leaveRequestId: existing.id },
      });
      await recordAgentResult(dependencies, context);
      emitEvent({ event: 'response', data: { runId, status: 'completed', ...context.result } });
    } else {
      const graph = createHcmAgentGraph(dependencies, context, emitEvent);
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
        await recordAgentResult(dependencies, context);
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
        threadId: safeInput.threadId,
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

export function resumeHcmAgentGraph(
  dependencies: HcmAgentGraphDependencies,
  input: {
    actorEmployeeCode: string;
    correlationId: string;
    threadId: string;
    runId: string;
    decision: AgentResumeInput['decision'];
  },
  emit: AgentEventSink = () => undefined,
): Promise<OnboardingInvocationResult> {
  return runHcmAgentGraph(
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
