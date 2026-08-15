import { AgentErrorCode, CommonErrorCode } from '../../enums/error.enum';
import { HcmAgentRoute, HcmGraphNode } from '../../enums/hcm-agent.enum';
import { ApplicationError } from '../../errors/application.error';
import { buildInvocationResult } from '../../helpers/onboarding-agent.helpers';
import type { AgentEventSink } from '../../types/agent-event-sink';
import type { HcmAgentExecutionContext } from '../../types/hcm-agent-execution-context';
import type { HcmAgentGraphDependencies } from '../../types/hcm-agent-graph-dependencies';
import { buildFailureResult, recordAgentResult } from '../../helpers/hcm-agent.helpers';

export function createResponseAuditNode(
  dependencies: HcmAgentGraphDependencies,
  context: HcmAgentExecutionContext,
  emit: AgentEventSink,
) {
  return async () => {
    if (!context.result) {
      if (!context.lookup || !context.review) {
        throw new ApplicationError(AgentErrorCode.GraphResultContextMissing);
      }
      const employee = context.lookup.employee;
      context.result = buildInvocationResult(200, {
        status: 'COMPLETED',
        message: 'Employee onboarding review completed.',
        runId: context.runId,
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
      await recordAgentResult(dependencies, context);
    } catch {
      context.result = buildFailureResult(
        context,
        500,
        CommonErrorCode.InternalError,
        'The workflow could not be completed.',
      );
    }
    emit({
      event: 'response',
      data: { runId: context.runId, status: 'completed', ...context.result },
    });
    return {
      route: HcmAgentRoute.Respond,
      lastNode: HcmGraphNode.ResponseAudit,
      outcomeCode: 'RESPONSE_READY',
    };
  };
}
