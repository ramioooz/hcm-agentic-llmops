import { HcmAgentRoute, HcmGraphNode, HcmIntentType } from '../../enums/hcm-agent.enum';
import { OnboardingReviewAction } from '../../enums/onboarding.enum';
import { enforceIntentConsistency } from '../../security/intent-consistency';
import type { AgentEventSink } from '../../types/agent-event-sink';
import type { HcmAgentExecutionContext } from '../../types/hcm-agent-execution-context';
import type { HcmAgentGraphDependencies } from '../../types/hcm-agent-graph-dependencies';
import {
  buildFailureResult,
  continueNormalizedIntent,
  emitNodeEvent,
  isTechnicalCommand,
  isUserCommand,
  pendingIntentFromState,
  pendingState,
  resolveAuthenticatedSelfTarget,
} from '../../helpers/hcm-agent.helpers';

type ContinuationState = Parameters<typeof pendingIntentFromState>[0];

export function createIntentNormalizationNode(
  dependencies: HcmAgentGraphDependencies,
  context: HcmAgentExecutionContext,
  emit: AgentEventSink,
) {
  return async (state: ContinuationState) => {
    if (isTechnicalCommand(context.input)) {
      context.intent = {
        intent: HcmIntentType.OnboardingReview,
        employeeCode: context.input.targetEmployeeCode,
        thresholdDays: context.input.thresholdDays,
        requestedAction:
          context.input.notificationPolicy === 'NONE'
            ? OnboardingReviewAction.ReviewOnly
            : OnboardingReviewAction.NotifyManager,
        missingFields: [],
      };
      emit({
        event: 'intent',
        data: {
          runId: context.runId,
          status: 'accepted',
          intent: HcmIntentType.OnboardingReview,
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
      emitNodeEvent(
        emit,
        context.runId,
        HcmGraphNode.IntentNormalization,
        'completed',
        'TYPED_COMMAND_ACCEPTED',
      );
      return {
        route: HcmAgentRoute.Continue,
        lastNode: HcmGraphNode.IntentNormalization,
        outcomeCode: 'TYPED_COMMAND_ACCEPTED',
      };
    }

    try {
      if (!isUserCommand(context.input)) throw new Error('GRAPH_COMMAND_INVALID');
      context.intent = resolveAuthenticatedSelfTarget(
        continueNormalizedIntent(
          context.input.query,
          enforceIntentConsistency(
            context.input.query,
            await dependencies.normalizer.normalize(context.input.query),
          ),
          pendingIntentFromState(state),
        ),
        context.input.actorEmployeeCode,
      );
      emit({
        event: 'intent',
        data: {
          runId: context.runId,
          status: 'normalized',
          intent: context.intent.intent,
          requestedAction: context.intent.requestedAction,
        },
      });
      context.steps.push({
        stepName: HcmGraphNode.IntentNormalization,
        status: context.intent.intent === HcmIntentType.Unsupported ? 'REJECTED' : 'COMPLETED',
        outcomeCode:
          context.intent.intent === HcmIntentType.Unsupported
            ? 'UNSUPPORTED_REQUEST'
            : 'INTENT_NORMALIZED',
        inputData: {
          intent: context.intent.intent,
          employeeCode: context.intent.employeeCode,
          thresholdDays: context.intent.thresholdDays,
          requestedAction: context.intent.requestedAction,
          missingFields: context.intent.missingFields,
          ...(context.intent.intent === HcmIntentType.LeaveRequest
            ? {
                leaveStartDate: context.intent.leaveStartDate,
                leaveEndDate: context.intent.leaveEndDate,
              }
            : {}),
        },
      });
      emitNodeEvent(
        emit,
        context.runId,
        HcmGraphNode.IntentNormalization,
        'completed',
        'INTENT_NORMALIZED',
      );
      return {
        route: HcmAgentRoute.Continue,
        lastNode: HcmGraphNode.IntentNormalization,
        outcomeCode: 'INTENT_NORMALIZED',
        ...pendingState(context.intent),
      };
    } catch {
      context.steps.push({
        stepName: HcmGraphNode.IntentNormalization,
        status: 'FAILED',
        outcomeCode: 'MODEL_UNAVAILABLE',
      });
      context.result = buildFailureResult(
        context,
        503,
        'MODEL_UNAVAILABLE',
        'The request could not be interpreted at this time.',
      );
      emitNodeEvent(
        emit,
        context.runId,
        HcmGraphNode.IntentNormalization,
        'failed',
        'MODEL_UNAVAILABLE',
      );
      return {
        route: HcmAgentRoute.Respond,
        lastNode: HcmGraphNode.IntentNormalization,
        outcomeCode: 'MODEL_UNAVAILABLE',
      };
    }
  };
}
