import { AgentErrorCode, CommonErrorCode } from '../../enums/error.enum';
import { HcmAgentRoute } from '../../enums/hcm-agent.enum';
import { OnboardingGraphNode, OnboardingReviewAction } from '../../enums/onboarding.enum';
import { SecurityEventType, SecuritySeverity } from '../../enums/security.enum';
import { createManagerNotificationTool } from '../../tools/onboarding.tools';
import type { AgentEventSink } from '../../types/agent-event-sink';
import type { HcmAgentExecutionContext } from '../../types/hcm-agent-execution-context';
import type { HcmAgentGraphDependencies } from '../../types/hcm-agent-graph-dependencies';
import { buildFailureResult, emitToolEvent, safeErrorCode } from '../../helpers/hcm-agent.helpers';
import { ApplicationError } from '../../errors/application.error';

export function createManagerNotificationNode(
  dependencies: HcmAgentGraphDependencies,
  context: HcmAgentExecutionContext,
  emit: AgentEventSink,
) {
  const notify = createManagerNotificationTool(dependencies.employees, dependencies.notifications);
  return async () => {
    if (!context.lookup || !context.review) {
      throw new ApplicationError(AgentErrorCode.GraphReviewMissing);
    }
    try {
      const result = await notify.invoke({
        actorEmployeeCode: context.lookup.actor.employeeCode,
        targetEmployeeCode: context.lookup.employee.employeeCode,
        explicit: context.review.action === OnboardingReviewAction.NotifyManager,
        withinThreshold: context.review.withinThreshold,
      });
      context.actionPerformed = result.performed;
      if (!result.performed) context.actionReason = result.reason;
      context.steps.push({
        stepName: OnboardingGraphNode.ManagerNotification,
        status: result.performed ? 'COMPLETED' : 'REJECTED',
        outcomeCode: result.performed ? 'MANAGER_NOTIFIED' : result.reason,
      });
      emitToolEvent(
        emit,
        context.runId,
        OnboardingGraphNode.ManagerNotification,
        result.performed ? 'completed' : 'skipped',
        result.performed ? 'MANAGER_NOTIFIED' : result.reason,
      );
    } catch (error) {
      const code = safeErrorCode(error);
      context.actionReason = code;
      context.steps.push({
        stepName: OnboardingGraphNode.ManagerNotification,
        status: 'FAILED',
        outcomeCode: code,
      });
      if (code === CommonErrorCode.AuthorizationDenied) {
        context.securityEvents.push({
          eventType: SecurityEventType.AuthorizationDenied,
          severity: SecuritySeverity.Medium,
        });
        context.result = buildFailureResult(
          context,
          403,
          code,
          'You are not authorized to perform this operation.',
        );
      } else {
        context.result = buildFailureResult(
          context,
          500,
          CommonErrorCode.InternalError,
          'The workflow could not be completed.',
        );
      }
      emitToolEvent(emit, context.runId, OnboardingGraphNode.ManagerNotification, 'failed', code);
    }
    return {
      route: HcmAgentRoute.Respond,
      lastNode: OnboardingGraphNode.ManagerNotification,
      outcomeCode: context.actionReason ?? 'MANAGER_NOTIFIED',
    };
  };
}
