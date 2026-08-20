import type { LeaveApprovalProposal } from './leave-approval-proposal';
import type { LeaveBalanceRecord } from './leave-balance-record';
import type { LeavePolicyRecord } from './leave-policy-record';
import type { LeaveProposalResult } from './leave-proposal-result';
import type { SubmittedLeaveRequest } from './leave-approval-store';

export interface LeaveApprovalWorkflow {
  resolveEmployeeCodeById(employeeId: string): Promise<string | null>;
  findSubmittedByThreadId(threadId: string): Promise<SubmittedLeaveRequest | undefined>;
  submit(input: {
    threadId: string;
    employeeCode: string;
    pending: LeaveApprovalProposal;
    policy: LeavePolicyRecord;
    balance: LeaveBalanceRecord;
  }): Promise<
    | { status: 'CHANGED'; proposal: LeaveProposalResult }
    | {
        status: 'SUBMITTED';
        proposal: LeaveProposalResult;
        request: SubmittedLeaveRequest;
      }
  >;
}
