import { interrupt } from '@langchain/langgraph';
import { LeaveErrorCode } from '../../enums/error.enum';
import { HcmAgentRoute } from '../../enums/hcm-agent.enum';
import { LeaveApprovalDecision, LeaveGraphNode } from '../../enums/leave.enum';
import { ApplicationError } from '../../errors/application.error';
import { buildInvocationResult } from '../../helpers/onboarding-agent.helpers';
import type { AgentEventSink } from '../../types/agent-event-sink';
import type { HcmAgentExecutionContext } from '../../types/hcm-agent-execution-context';
import type { HcmAgentGraphDependencies } from '../../types/hcm-agent-graph-dependencies';
import type { LeaveApprovalProposal } from '../../types/leave-approval-proposal';
import { buildFailureResult } from '../../helpers/hcm-agent.helpers';
import { loadLeaveContext } from './leave-context.node';

export function createLeaveApprovalNode(
  dependencies: HcmAgentGraphDependencies,
  context: HcmAgentExecutionContext,
  emit: AgentEventSink,
) {
  return async (state: { pendingLeaveApproval?: LeaveApprovalProposal | null }) => {
    const pending = state.pendingLeaveApproval;
    if (!pending || !dependencies.leaves || !dependencies.leaveApprovals) {
      context.result = buildFailureResult(
        context,
        500,
        'INTERNAL_ERROR',
        'The workflow could not be completed.',
      );
      return { route: HcmAgentRoute.Respond, pendingLeaveApproval: null };
    }
    emit({
      event: 'approval',
      data: { runId: context.runId, status: 'awaiting', outcomeCode: 'LEAVE_APPROVAL_REQUIRED' },
    });
    const decision = interrupt({
      kind: 'LEAVE_APPROVAL',
      startDate: pending.startDate,
      endDate: pending.endDate,
      requestedWorkingDays: pending.requestedWorkingDays,
    });
    if (decision !== LeaveApprovalDecision.Approve && decision !== LeaveApprovalDecision.Reject) {
      throw new ApplicationError(LeaveErrorCode.InvalidApprovalDecision);
    }
    if (decision === LeaveApprovalDecision.Reject) {
      context.steps.push({
        stepName: LeaveGraphNode.Approval,
        status: 'REJECTED',
        outcomeCode: 'LEAVE_REQUEST_REJECTED',
      });
      context.result = buildInvocationResult(200, {
        status: 'REJECTED',
        code: 'LEAVE_REQUEST_REJECTED',
        message: 'The leave request proposal was rejected; no request was created.',
        threadId: context.input.threadId,
        runId: context.runId,
        correlationId: context.input.correlationId,
      });
      emit({
        event: 'approval',
        data: { runId: context.runId, status: 'rejected', outcomeCode: 'LEAVE_REQUEST_REJECTED' },
      });
      return { route: HcmAgentRoute.Respond, pendingLeaveApproval: null };
    }

    const targetEmployeeCode = await dependencies.leaveApprovals.resolveEmployeeCodeById(
      pending.employeeId,
    );
    if (!targetEmployeeCode) {
      context.result = buildFailureResult(
        context,
        404,
        'EMPLOYEE_NOT_FOUND',
        'The employee was not found.',
      );
      return { route: HcmAgentRoute.Respond, pendingLeaveApproval: null };
    }
    const loaded = await loadLeaveContext(
      dependencies,
      context,
      emit,
      targetEmployeeCode,
      pending.startDate,
    );
    if (!loaded || !context.leavePolicy || !context.leaveBalance) {
      return { route: HcmAgentRoute.Respond, pendingLeaveApproval: null };
    }
    const submission = await dependencies.leaveApprovals.submit({
      threadId: context.input.threadId,
      employeeCode: targetEmployeeCode,
      pending,
      policy: context.leavePolicy,
      balance: context.leaveBalance,
    });
    const revalidated = submission.proposal;
    context.steps.push({
      stepName: LeaveGraphNode.Proposal,
      status: 'COMPLETED',
      outcomeCode: revalidated.eligible ? 'LEAVE_PROPOSAL_ELIGIBLE' : 'LEAVE_PROPOSAL_INELIGIBLE',
      outputData: {
        requestedWorkingDays: revalidated.requestedWorkingDays,
        noticeWorkingDays: revalidated.noticeWorkingDays,
        availableDays: revalidated.availableDays,
        eligible: revalidated.eligible,
        reasons: revalidated.reasons,
      },
    });
    if (submission.status === 'CHANGED') {
      context.result = buildInvocationResult(409, {
        status: 'FAILED',
        code: 'LEAVE_PROPOSAL_CHANGED',
        message: 'The leave proposal is no longer eligible after revalidation.',
        threadId: context.input.threadId,
        runId: context.runId,
        correlationId: context.input.correlationId,
      });
      return { route: HcmAgentRoute.Respond, pendingLeaveApproval: null };
    }

    const submitted = submission.request;
    context.steps.push({
      stepName: LeaveGraphNode.Approval,
      status: 'COMPLETED',
      outcomeCode: 'LEAVE_REQUEST_SUBMITTED',
    });
    context.result = buildInvocationResult(201, {
      status: 'COMPLETED',
      message: 'The approved leave request was submitted.',
      threadId: context.input.threadId,
      runId: context.runId,
      correlationId: context.input.correlationId,
      data: {
        leaveRequestId: submitted.id,
        leaveRequestStatus: submitted.status,
        documentUrl: `/api/v1/leave-requests/${submitted.id}/document`,
      },
    });
    emit({
      event: 'approval',
      data: { runId: context.runId, status: 'approved', outcomeCode: 'LEAVE_REQUEST_SUBMITTED' },
    });
    emit({
      event: 'document',
      data: { runId: context.runId, status: 'available', leaveRequestId: submitted.id },
    });
    return { route: HcmAgentRoute.Respond, pendingLeaveApproval: null };
  };
}
