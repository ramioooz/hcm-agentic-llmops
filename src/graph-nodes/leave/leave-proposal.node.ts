import { HcmAgentRoute, HcmIntentType } from '../../enums/hcm-agent.enum';
import { LeaveGraphNode } from '../../enums/leave.enum';
import { buildInvocationResult } from '../../helpers/onboarding-agent.helpers';
import { evaluateLeaveProposal } from '../../services/leave-proposal.service';
import type { HcmAgentExecutionContext } from '../../types/hcm-agent-execution-context';
import { buildFailureResult } from '../../helpers/hcm-agent.helpers';

export function createLeaveProposalNode(context: HcmAgentExecutionContext, today: () => string) {
  return () => {
    const intent = context.intent;
    if (
      intent?.intent !== HcmIntentType.LeaveRequest ||
      !intent.leaveStartDate ||
      !intent.leaveEndDate ||
      !context.leavePolicy ||
      !context.leaveBalance
    ) {
      throw new Error('LEAVE_CONTEXT_MISSING');
    }
    try {
      const proposal = evaluateLeaveProposal({
        today: today(),
        startDate: intent.leaveStartDate,
        endDate: intent.leaveEndDate,
        policy: context.leavePolicy,
        balance: context.leaveBalance,
      });
      context.leaveApproval = proposal.eligible
        ? {
            employeeId: context.leaveBalance.employeeId,
            policyId: context.leavePolicy.id,
            startDate: intent.leaveStartDate,
            endDate: intent.leaveEndDate,
            requestedWorkingDays: proposal.requestedWorkingDays,
          }
        : undefined;
      context.steps.push({
        stepName: LeaveGraphNode.Proposal,
        status: 'COMPLETED',
        outcomeCode: proposal.eligible ? 'LEAVE_PROPOSAL_ELIGIBLE' : 'LEAVE_PROPOSAL_INELIGIBLE',
        outputData: {
          requestedWorkingDays: proposal.requestedWorkingDays,
          noticeWorkingDays: proposal.noticeWorkingDays,
          availableDays: proposal.availableDays,
          eligible: proposal.eligible,
          reasons: proposal.reasons,
        },
      });
      context.result = buildInvocationResult(200, {
        status: 'COMPLETED',
        message: 'Leave request proposal prepared; no request was created.',
        threadId: context.input.threadId,
        runId: context.runId,
        correlationId: context.input.correlationId,
        data: { requestCreated: false, proposal },
      });
      return {
        route: proposal.eligible ? HcmAgentRoute.Approval : HcmAgentRoute.Respond,
        pendingLeaveApproval: context.leaveApproval ?? null,
        lastNode: LeaveGraphNode.Proposal,
        outcomeCode: proposal.eligible ? 'LEAVE_PROPOSAL_ELIGIBLE' : 'LEAVE_PROPOSAL_INELIGIBLE',
      };
    } catch (error) {
      const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
      const isInvalidDates = code === 'INVALID_LEAVE_DATES';
      context.result = buildFailureResult(
        context,
        isInvalidDates ? 400 : 500,
        isInvalidDates ? code : 'INTERNAL_ERROR',
        isInvalidDates
          ? 'Provide a valid leave date range.'
          : 'The workflow could not be completed.',
      );
      return {
        route: HcmAgentRoute.Respond,
        pendingLeaveApproval: null,
        lastNode: LeaveGraphNode.Proposal,
        outcomeCode: isInvalidDates ? code : 'INTERNAL_ERROR',
      };
    }
  };
}
