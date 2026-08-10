import { HcmAgentRoute, HcmGraphNode } from '../../enums/hcm-agent.enum';
import { SecurityEventType, SecuritySeverity } from '../../enums/security.enum';
import { evaluateRequestSafety } from '../../security/request-safety';
import type { AgentEventSink } from '../../types/agent-event-sink';
import type { HcmAgentExecutionContext } from '../../types/hcm-agent-execution-context';
import {
  buildFailureResult,
  emitNodeEvent,
  isTechnicalCommand,
} from '../../helpers/hcm-agent.helpers';

export function createRequestGuardNode(context: HcmAgentExecutionContext, emit: AgentEventSink) {
  return () => {
    if (isTechnicalCommand(context.input)) {
      emitNodeEvent(
        emit,
        context.runId,
        HcmGraphNode.RequestGuard,
        'completed',
        'TYPED_COMMAND_ACCEPTED',
      );
      return {
        route: HcmAgentRoute.Continue,
        lastNode: HcmGraphNode.RequestGuard,
        outcomeCode: 'TYPED_COMMAND_ACCEPTED',
      };
    }
    const safety = evaluateRequestSafety(context.input.query);
    if (!safety.isSafe) {
      const outcomeCode = 'UNSAFE_REQUEST_REJECTED';
      context.steps.push({
        stepName: HcmGraphNode.RequestGuard,
        status: 'REJECTED',
        outcomeCode,
        inputData: { reasonCode: safety.reasonCode },
      });
      context.securityEvents.push({
        eventType: SecurityEventType.UnsafeRequestRejected,
        severity: SecuritySeverity.High,
        details: { reasonCode: safety.reasonCode },
      });
      context.result = buildFailureResult(
        context,
        403,
        outcomeCode,
        'The request was rejected because it contains unsafe instructions.',
      );
      emitNodeEvent(emit, context.runId, HcmGraphNode.RequestGuard, 'rejected', outcomeCode);
      return {
        route: HcmAgentRoute.Respond,
        lastNode: HcmGraphNode.RequestGuard,
        outcomeCode,
      };
    }
    emitNodeEvent(emit, context.runId, HcmGraphNode.RequestGuard, 'completed', 'REQUEST_ACCEPTED');
    return {
      route: HcmAgentRoute.Continue,
      lastNode: HcmGraphNode.RequestGuard,
      outcomeCode: 'REQUEST_ACCEPTED',
    };
  };
}
