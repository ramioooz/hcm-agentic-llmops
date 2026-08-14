import { HcmAgentRoute, HcmGraphNode, HcmIntentType, HcmWorker } from '../../enums/hcm-agent.enum';
import { buildInvocationResult } from '../../helpers/onboarding-agent.helpers';
import { routeHcmIntent } from '../../graph-routing/intent.route';
import type { AgentEventSink } from '../../types/agent-event-sink';
import type { HcmAgentExecutionContext } from '../../types/hcm-agent-execution-context';
import { emitNodeEvent } from '../../helpers/hcm-agent.helpers';

export function createSupervisorRoutingNode(
  context: HcmAgentExecutionContext,
  emit: AgentEventSink,
) {
  return () => {
    const intent = context.intent;
    if (!intent) throw new Error('GRAPH_INTENT_MISSING');
    const worker = routeHcmIntent(intent);
    if (worker === HcmWorker.Unsupported) {
      context.result = buildInvocationResult(200, {
        status: 'UNSUPPORTED_REQUEST',
        message: 'That request is outside the capabilities of this HCM agent.',
        runId: context.runId,
        threadId: context.input.threadId,
        correlationId: context.input.correlationId,
      });
      emitNodeEvent(emit, context.runId, HcmGraphNode.Routing, 'rejected', 'UNSUPPORTED_REQUEST');
      return {
        route: HcmAgentRoute.Respond,
        lastNode: HcmGraphNode.Routing,
        outcomeCode: 'UNSUPPORTED_REQUEST',
      };
    }
    if (worker === HcmWorker.Leave && intent.intent === HcmIntentType.LeaveRequest) {
      if (!intent.leaveStartDate || !intent.leaveEndDate) {
        context.result = buildInvocationResult(200, {
          status: 'NEED_MORE_INFORMATION',
          message: 'Please provide the leave start and end dates in YYYY-MM-DD format.',
          missingFields: intent.missingFields,
          runId: context.runId,
          threadId: context.input.threadId,
          correlationId: context.input.correlationId,
        });
        emitNodeEvent(
          emit,
          context.runId,
          HcmGraphNode.Routing,
          'rejected',
          'LEAVE_DATES_REQUIRED',
        );
        return {
          route: HcmAgentRoute.Respond,
          lastNode: HcmGraphNode.Routing,
          outcomeCode: 'LEAVE_DATES_REQUIRED',
        };
      }
      emitNodeEvent(emit, context.runId, HcmGraphNode.Routing, 'completed', 'LEAVE_REQUEST_ROUTED');
      return {
        route: HcmAgentRoute.Leave,
        lastNode: HcmGraphNode.Routing,
        outcomeCode: 'LEAVE_REQUEST_ROUTED',
      };
    }
    if (!intent.employeeCode) {
      context.result = buildInvocationResult(200, {
        status: 'NEED_MORE_INFORMATION',
        message: 'Please provide the employee ID.',
        missingFields: ['employeeId'],
        runId: context.runId,
        threadId: context.input.threadId,
        correlationId: context.input.correlationId,
      });
      emitNodeEvent(emit, context.runId, HcmGraphNode.Routing, 'rejected', 'EMPLOYEE_ID_REQUIRED');
      return {
        route: HcmAgentRoute.Respond,
        lastNode: HcmGraphNode.Routing,
        outcomeCode: 'EMPLOYEE_ID_REQUIRED',
      };
    }
    emitNodeEvent(
      emit,
      context.runId,
      HcmGraphNode.Routing,
      'completed',
      'ONBOARDING_REVIEW_ROUTED',
    );
    return {
      route: HcmAgentRoute.Onboarding,
      lastNode: HcmGraphNode.Routing,
      outcomeCode: 'ONBOARDING_REVIEW_ROUTED',
    };
  };
}
