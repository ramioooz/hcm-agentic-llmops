import { Command } from '@langchain/langgraph';
import { AgentErrorCode } from '../enums/error.enum';
import { LeaveApprovalDecision } from '../enums/leave.enum';
import { ApplicationError } from '../errors/application.error';
import { createHcmAgentGraph } from '../graphs/hcm-agent.graph';
import { buildInvocationResult } from '../helpers/onboarding-agent.helpers';
import { AgentExecutionObserver } from '../observability/agent-execution-observer';
import {
  recordAgentResult,
  recordThreadIdentityMismatch as persistThreadIdentityMismatch,
} from '../observability/agent-run-audit';
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
import { buildFailureResult, isTechnicalCommand } from '../helpers/hcm-agent.helpers';

async function recordThreadIdentityMismatch(
  dependencies: HcmAgentGraphDependencies,
  input: OnboardingInvocationInput & { threadId: string },
  runId: string,
): Promise<OnboardingInvocationResult> {
  const result = buildInvocationResult(403, {
    status: 'FAILED',
    code: AgentErrorCode.ThreadIdentityMismatch,
    message: 'This conversation belongs to a different employee identity.',
    threadId: input.threadId,
    runId,
    correlationId: input.correlationId,
  });
  await persistThreadIdentityMismatch(dependencies.recorder, input, runId, result);
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
  const observer = new AgentExecutionObserver({
    recorder: dependencies.traceRecorder,
    configuredModel: dependencies.configuredModel ?? 'unconfigured',
    promptVersion: HCM_INTENT_PROMPT_VERSION,
    startedAt,
    input: safeInput,
    runId,
    forward: emit,
  });
  const emitEvent = observer.emit;
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
  if (!owner) {
    observer.markAuthorizationDenied();
    observer.recordNode('identity_resolution');
    context.result = buildFailureResult(
      context,
      401,
      'AUTHENTICATION_REQUIRED',
      'The employee identity was not found.',
    );
    emitEvent({ event: 'response', data: { runId, status: 'completed', ...context.result } });
  } else {
    const identityRejection = await rejectThreadIdentityMismatch(
      dependencies,
      safeInput,
      runId,
      owner,
    );
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
        await recordAgentResult(dependencies.recorder, context);
        emitEvent({ event: 'response', data: { runId, status: 'completed', ...context.result } });
      } else {
        const graph = createHcmAgentGraph(dependencies, context, emitEvent);
        const output = await graph.invoke(
          resumeDecision
            ? new Command({ resume: resumeDecision })
            : { ownerBindingId: owner.bindingId },
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
          await recordAgentResult(dependencies.recorder, context);
          emitEvent({ event: 'response', data: { runId, status: 'completed', ...context.result } });
        }
      }
    }
  }
  if (!context.result) throw new ApplicationError(AgentErrorCode.GraphResultMissing);

  await observer.complete({
    result: context.result,
    guardrailReasonCode: context.guardrailReasonCode,
  });
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
