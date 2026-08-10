export enum LeaveApprovalDecision {
  Approve = 'APPROVE',
  Reject = 'REJECT',
}

export enum LeaveGraphNode {
  Context = 'parallel_leave_context',
  Proposal = 'leave_proposal_calculation',
  Approval = 'leave_approval',
}
