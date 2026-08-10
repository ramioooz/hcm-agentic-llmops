import { HcmAgentRoute, HcmIntentType } from '../../enums/hcm-agent.enum';
import { OnboardingGraphNode, OnboardingReviewAction } from '../../enums/onboarding.enum';
import { createOnboardingCalculationTool } from '../../tools/onboarding.tools';
import type { AgentEventSink } from '../../types/agent-event-sink';
import type { HcmAgentExecutionContext } from '../../types/hcm-agent-execution-context';
import type { HcmAgentGraphDependencies } from '../../types/hcm-agent-graph-dependencies';
import type { OnboardingReviewResult } from '../../types/onboarding-review-result';
import { buildFailureResult, emitToolEvent, safeErrorCode } from '../../helpers/hcm-agent.helpers';

export function createOnboardingCalculationNode(
  dependencies: HcmAgentGraphDependencies,
  context: HcmAgentExecutionContext,
  emit: AgentEventSink,
) {
  const calculate = createOnboardingCalculationTool(dependencies.employees);
  return async () => {
    if (!context.lookup || context.intent?.intent !== HcmIntentType.OnboardingReview) {
      throw new Error('GRAPH_LOOKUP_MISSING');
    }
    try {
      context.review = (await calculate.invoke({
        actorEmployeeCode: context.lookup.actor.employeeCode,
        targetEmployeeCode: context.lookup.employee.employeeCode,
        today: dependencies.clock.today(),
        thresholdDays: context.intent.thresholdDays ?? 30,
        requestedAction:
          context.intent.requestedAction === OnboardingReviewAction.NotifyManager
            ? OnboardingReviewAction.NotifyManager
            : OnboardingReviewAction.ReviewOnly,
      })) as OnboardingReviewResult;
      context.steps.push({
        stepName: 'onboarding_review',
        status: 'COMPLETED',
        outcomeCode: 'REVIEW_EVALUATED',
        outputData: context.review,
      });
      emitToolEvent(
        emit,
        context.runId,
        OnboardingGraphNode.Calculation,
        'completed',
        'REVIEW_EVALUATED',
      );
      return {
        route:
          context.review.action === OnboardingReviewAction.NotifyManager
            ? HcmAgentRoute.Notify
            : HcmAgentRoute.Respond,
        lastNode: OnboardingGraphNode.Calculation,
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
      context.steps.push({
        stepName: 'onboarding_review',
        status: 'FAILED',
        outcomeCode: code,
      });
      context.result = buildFailureResult(context, response[0], code, response[1]);
      emitToolEvent(emit, context.runId, OnboardingGraphNode.Calculation, 'failed', code);
      return {
        route: HcmAgentRoute.Respond,
        lastNode: OnboardingGraphNode.Calculation,
        outcomeCode: code,
      };
    }
  };
}
