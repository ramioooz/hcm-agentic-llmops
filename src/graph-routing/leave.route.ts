import { HcmAgentRoute } from '../enums/hcm-agent.enum';
import { LeaveGraphNode } from '../enums/leave.enum';

export function routeAfterLeaveContext(state: {
  route: HcmAgentRoute;
}): LeaveGraphNode.Proposal | '__end__' {
  return state.route === HcmAgentRoute.Calculate ? LeaveGraphNode.Proposal : '__end__';
}

export function routeAfterLeaveProposal(state: {
  route: HcmAgentRoute;
}): LeaveGraphNode.Approval | '__end__' {
  return state.route === HcmAgentRoute.Approval ? LeaveGraphNode.Approval : '__end__';
}
