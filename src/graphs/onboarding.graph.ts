import { END, START, StateGraph } from '@langchain/langgraph';
import { OnboardingGraphNode } from '../enums/onboarding.enum';
import { createEmployeeLookupNode } from '../graph-nodes/onboarding/employee-lookup.node';
import { createManagerNotificationNode } from '../graph-nodes/onboarding/manager-notification.node';
import { createOnboardingCalculationNode } from '../graph-nodes/onboarding/onboarding-calculation.node';
import {
  routeAfterEmployeeLookup,
  routeAfterOnboardingCalculation,
} from '../graph-routing/onboarding.route';
import { OnboardingState } from '../graph-state/onboarding.state';
import type { AgentEventSink } from '../types/agent-event-sink';
import type { HcmAgentExecutionContext } from '../types/hcm-agent-execution-context';
import type { HcmAgentGraphDependencies } from '../types/hcm-agent-graph-dependencies';

export function createOnboardingGraph(
  dependencies: HcmAgentGraphDependencies,
  context: HcmAgentExecutionContext,
  emit: AgentEventSink,
) {
  return new StateGraph(OnboardingState)
    .addNode(
      OnboardingGraphNode.EmployeeLookup,
      createEmployeeLookupNode(dependencies, context, emit),
    )
    .addNode(
      OnboardingGraphNode.Calculation,
      createOnboardingCalculationNode(dependencies, context, emit),
    )
    .addNode(
      OnboardingGraphNode.ManagerNotification,
      createManagerNotificationNode(dependencies, context, emit),
    )
    .addEdge(START, OnboardingGraphNode.EmployeeLookup)
    .addConditionalEdges(OnboardingGraphNode.EmployeeLookup, routeAfterEmployeeLookup, [
      OnboardingGraphNode.Calculation,
      END,
    ])
    .addConditionalEdges(OnboardingGraphNode.Calculation, routeAfterOnboardingCalculation, [
      OnboardingGraphNode.ManagerNotification,
      END,
    ])
    .addEdge(OnboardingGraphNode.ManagerNotification, END)
    .compile();
}
