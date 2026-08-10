import { END, START, StateGraph } from '@langchain/langgraph';
import { LeaveGraphNode } from '../enums/leave.enum';
import { createLeaveApprovalNode } from '../graph-nodes/leave/leave-approval.node';
import { createLeaveContextNode } from '../graph-nodes/leave/leave-context.node';
import { createLeaveProposalNode } from '../graph-nodes/leave/leave-proposal.node';
import { routeAfterLeaveContext, routeAfterLeaveProposal } from '../graph-routing/leave.route';
import { LeaveState } from '../graph-state/leave.state';
import type { AgentEventSink } from '../types/agent-event-sink';
import type { HcmAgentExecutionContext } from '../types/hcm-agent-execution-context';
import type { HcmAgentGraphDependencies } from '../types/hcm-agent-graph-dependencies';

export function createLeaveGraph(
  dependencies: HcmAgentGraphDependencies,
  context: HcmAgentExecutionContext,
  emit: AgentEventSink,
) {
  return new StateGraph(LeaveState)
    .addNode(LeaveGraphNode.Context, createLeaveContextNode(dependencies, context, emit))
    .addNode(
      LeaveGraphNode.Proposal,
      createLeaveProposalNode(context, () => dependencies.clock.today()),
    )
    .addNode(LeaveGraphNode.Approval, createLeaveApprovalNode(dependencies, context, emit))
    .addEdge(START, LeaveGraphNode.Context)
    .addConditionalEdges(LeaveGraphNode.Context, routeAfterLeaveContext, [
      LeaveGraphNode.Proposal,
      END,
    ])
    .addConditionalEdges(LeaveGraphNode.Proposal, routeAfterLeaveProposal, [
      LeaveGraphNode.Approval,
      END,
    ])
    .addEdge(LeaveGraphNode.Approval, END)
    .compile();
}
