import { END, START, StateGraph } from '@langchain/langgraph';
import { HcmGraphNode } from '../enums/hcm-agent.enum';
import { createIntentNormalizationNode } from '../graph-nodes/shared/intent-normalization.node';
import { createRequestGuardNode } from '../graph-nodes/shared/request-guard.node';
import { createResponseAuditNode } from '../graph-nodes/shared/response-audit.node';
import { createSupervisorRoutingNode } from '../graph-nodes/shared/supervisor-routing.node';
import {
  routeAfterIntentNormalization,
  routeAfterRequestGuard,
  routeAfterSupervisor,
} from '../graph-routing/intent.route';
import { HcmAgentState } from '../graph-state/hcm-agent.state';
import type { AgentEventSink } from '../types/agent-event-sink';
import type { HcmAgentExecutionContext } from '../types/hcm-agent-execution-context';
import type { HcmAgentGraphDependencies } from '../types/hcm-agent-graph-dependencies';
import { createLeaveGraph } from './leave.graph';
import { createOnboardingGraph } from './onboarding.graph';

export function createHcmAgentGraph(
  dependencies: HcmAgentGraphDependencies,
  context: HcmAgentExecutionContext,
  emit: AgentEventSink,
  options: { agentServerManagedCheckpointer?: boolean } = {},
) {
  const graph = new StateGraph(HcmAgentState)
    .addNode(HcmGraphNode.RequestGuard, createRequestGuardNode(context, emit))
    .addNode(
      HcmGraphNode.IntentNormalization,
      createIntentNormalizationNode(dependencies, context, emit),
    )
    .addNode(HcmGraphNode.Routing, createSupervisorRoutingNode(context, emit))
    .addNode(HcmGraphNode.Onboarding, createOnboardingGraph(dependencies, context, emit))
    .addNode(HcmGraphNode.Leave, createLeaveGraph(dependencies, context, emit))
    .addNode(HcmGraphNode.ResponseAudit, createResponseAuditNode(dependencies, context, emit))
    .addEdge(START, HcmGraphNode.RequestGuard)
    .addConditionalEdges(HcmGraphNode.RequestGuard, routeAfterRequestGuard, [
      HcmGraphNode.IntentNormalization,
      HcmGraphNode.ResponseAudit,
    ])
    .addConditionalEdges(HcmGraphNode.IntentNormalization, routeAfterIntentNormalization, [
      HcmGraphNode.Routing,
      HcmGraphNode.ResponseAudit,
    ])
    .addConditionalEdges(HcmGraphNode.Routing, routeAfterSupervisor, [
      HcmGraphNode.Onboarding,
      HcmGraphNode.Leave,
      HcmGraphNode.ResponseAudit,
    ])
    .addEdge(HcmGraphNode.Onboarding, HcmGraphNode.ResponseAudit)
    .addEdge(HcmGraphNode.Leave, HcmGraphNode.ResponseAudit)
    .addEdge(HcmGraphNode.ResponseAudit, END);

  return options.agentServerManagedCheckpointer
    ? graph.compile()
    : graph.compile({ checkpointer: dependencies.checkpointer });
}
