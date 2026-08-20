import { createHash } from 'node:crypto';
import { LeaveDocumentTemplateVersion } from '../enums/leave.enum';
import type { Clock } from '../types/clock';
import type { LeaveApprovalStore } from '../types/leave-approval-store';
import type { LeaveApprovalWorkflow } from '../types/leave-approval-workflow';
import { evaluateLeaveProposal } from './leave-proposal.service';

export class LeaveApprovalService implements LeaveApprovalWorkflow {
  public constructor(
    private readonly dependencies: {
      store: LeaveApprovalStore;
      clock: Clock;
    },
  ) {}

  public resolveEmployeeCodeById(employeeId: string) {
    return this.dependencies.store.resolveEmployeeCodeById(employeeId);
  }

  public findSubmittedByThreadId(threadId: string) {
    return this.dependencies.store.findSubmittedByThreadId(threadId);
  }

  public async submit(input: Parameters<LeaveApprovalWorkflow['submit']>[0]) {
    const proposal = evaluateLeaveProposal({
      today: this.dependencies.clock.today(),
      startDate: input.pending.startDate,
      endDate: input.pending.endDate,
      policy: input.policy,
      balance: input.balance,
    });
    if (!proposal.eligible) return { status: 'CHANGED' as const, proposal };

    const request = await this.dependencies.store.submitApproved({
      id: `lr_${createHash('sha256').update(input.threadId).digest('hex').slice(0, 24)}`,
      approvalThreadId: input.threadId,
      employeeId: input.balance.employeeId,
      employeeCode: input.employeeCode,
      policyId: input.policy.id,
      startDate: input.pending.startDate,
      endDate: input.pending.endDate,
      requestedWorkingDays: proposal.requestedWorkingDays,
      documentTemplateVersion: LeaveDocumentTemplateVersion.V1,
    });
    return { status: 'SUBMITTED' as const, proposal, request };
  }
}
