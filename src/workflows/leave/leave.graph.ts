import { END, START, StateGraph, StateSchema, UntrackedValue } from '@langchain/langgraph';
import { z } from 'zod';
import { buildInvocationResult } from '../../helpers/onboarding-agent.helpers';
import { createLeaveBalanceTool, createLeavePolicyTool } from '../../tools/leave.tools';
import type { AgentProgressEvent } from '../../types/agent-progress-event';
import type { AgentRunStepRecord } from '../../types/agent-run-step-record';
import type { EmployeeReader } from '../../types/employee-reader';
import type { LeaveBalanceRecord } from '../../types/leave-balance-record';
import type { LeavePolicyRecord } from '../../types/leave-policy-record';
import type { LeaveReader } from '../../types/leave-reader';
import type { OnboardingInvocationResult } from '../../types/onboarding-invocation-result';
import type { SecurityEventRecord } from '../../types/security-event-record';
import { evaluateLeaveProposal } from './evaluate-leave-proposal';

const LeaveWorkerState = new StateSchema({
  route: new UntrackedValue(z.enum(['CALCULATE', 'RESPOND'])),
});

export type LeaveWorkerDependencies = {
  employees: EmployeeReader;
  leaves: LeaveReader;
};

export type LeaveWorkerInput = {
  actorEmployeeCode: string;
  targetEmployeeCode: string;
  startDate: string;
  endDate: string;
  today: string;
  threadId: string;
  runId: string;
  correlationId: string;
};

type EventSink = (event: AgentProgressEvent) => void;

type LeaveWorkerContext = {
  policy?: LeavePolicyRecord;
  balance?: LeaveBalanceRecord;
  result?: OnboardingInvocationResult;
  steps: AgentRunStepRecord[];
  securityEvents: SecurityEventRecord[];
  approval?: LeaveApprovalProposal;
};

export type LeaveApprovalProposal = {
  employeeId: string;
  policyId: string;
  startDate: string;
  endDate: string;
  requestedWorkingDays: number;
};

function failureResult(input: LeaveWorkerInput, httpStatus: number, code: string, message: string) {
  return buildInvocationResult(httpStatus, {
    status: 'FAILED',
    code,
    message,
    threadId: input.threadId,
    runId: input.runId,
    correlationId: input.correlationId,
  });
}

function safeLeaveError(error: unknown): {
  code: string;
  httpStatus: number;
  message: string;
} {
  const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
  if (code === 'AUTHENTICATION_REQUIRED') {
    return { code, httpStatus: 401, message: 'Identity was not found.' };
  }
  if (code === 'AUTHORIZATION_DENIED') {
    return { code, httpStatus: 403, message: 'You are not authorized to perform this operation.' };
  }
  if (code === 'EMPLOYEE_NOT_FOUND') {
    return { code, httpStatus: 404, message: 'The employee was not found.' };
  }
  if (code === 'EMPLOYEE_INACTIVE') {
    return { code, httpStatus: 409, message: 'The employee is not active.' };
  }
  if (code === 'LEAVE_POLICY_NOT_FOUND' || code === 'LEAVE_BALANCE_NOT_FOUND') {
    return { code, httpStatus: 404, message: 'Annual leave information was not found.' };
  }
  if (code === 'INVALID_LEAVE_DATES') {
    return { code, httpStatus: 400, message: 'Provide a valid leave date range.' };
  }
  return {
    code: 'INTERNAL_ERROR',
    httpStatus: 500,
    message: 'The workflow could not be completed.',
  };
}

export async function runLeaveWorkerGraph(
  dependencies: LeaveWorkerDependencies,
  input: LeaveWorkerInput,
  emit: EventSink = () => undefined,
): Promise<{
  result: OnboardingInvocationResult;
  steps: AgentRunStepRecord[];
  securityEvents: SecurityEventRecord[];
  approval?: LeaveApprovalProposal;
}> {
  const context: LeaveWorkerContext = { steps: [], securityEvents: [] };
  const policyTool = createLeavePolicyTool(dependencies.employees, dependencies.leaves);
  const balanceTool = createLeaveBalanceTool(dependencies.employees, dependencies.leaves);
  const graph = new StateGraph(LeaveWorkerState)
    .addNode('parallel_leave_context', async () => {
      try {
        const [policy, balance] = await Promise.all([
          policyTool.invoke({
            actorEmployeeCode: input.actorEmployeeCode,
            targetEmployeeCode: input.targetEmployeeCode,
          }),
          balanceTool.invoke({
            actorEmployeeCode: input.actorEmployeeCode,
            targetEmployeeCode: input.targetEmployeeCode,
            year: Number(input.startDate.slice(0, 4)),
          }),
        ]);
        context.policy = policy;
        context.balance = balance;
        context.steps.push(
          {
            stepName: 'leave_policy_lookup',
            status: 'COMPLETED',
            outcomeCode: 'LEAVE_POLICY_FOUND',
          },
          {
            stepName: 'leave_balance_lookup',
            status: 'COMPLETED',
            outcomeCode: 'LEAVE_BALANCE_FOUND',
          },
        );
        emit({
          event: 'tool',
          data: {
            runId: input.runId,
            tool: 'leave_policy_lookup',
            status: 'completed',
            outcomeCode: 'LEAVE_POLICY_FOUND',
          },
        });
        emit({
          event: 'tool',
          data: {
            runId: input.runId,
            tool: 'leave_balance_lookup',
            status: 'completed',
            outcomeCode: 'LEAVE_BALANCE_FOUND',
          },
        });
        return { route: 'CALCULATE' as const };
      } catch (error) {
        const failure = safeLeaveError(error);
        context.steps.push({
          stepName: 'leave_context_lookup',
          status: failure.code === 'AUTHORIZATION_DENIED' ? 'REJECTED' : 'FAILED',
          outcomeCode: failure.code,
        });
        if (failure.code === 'AUTHORIZATION_DENIED') {
          context.securityEvents.push({
            eventType: 'AUTHORIZATION_DENIED',
            severity: 'MEDIUM',
          });
        }
        context.result = failureResult(input, failure.httpStatus, failure.code, failure.message);
        return { route: 'RESPOND' as const };
      }
    })
    .addNode('leave_proposal_calculation', () => {
      if (!context.policy || !context.balance) throw new Error('LEAVE_CONTEXT_MISSING');
      try {
        const proposal = evaluateLeaveProposal({
          today: input.today,
          startDate: input.startDate,
          endDate: input.endDate,
          policy: context.policy,
          balance: context.balance,
        });
        if (proposal.eligible) {
          context.approval = {
            employeeId: context.balance.employeeId,
            policyId: context.policy.id,
            startDate: input.startDate,
            endDate: input.endDate,
            requestedWorkingDays: proposal.requestedWorkingDays,
          };
        }
        context.steps.push({
          stepName: 'leave_proposal_calculation',
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
          threadId: input.threadId,
          runId: input.runId,
          correlationId: input.correlationId,
          data: { requestCreated: false, proposal },
        });
      } catch (error) {
        const failure = safeLeaveError(error);
        context.result = failureResult(input, failure.httpStatus, failure.code, failure.message);
      }
      return { route: 'RESPOND' as const };
    })
    .addEdge(START, 'parallel_leave_context')
    .addConditionalEdges('parallel_leave_context', (state) =>
      state.route === 'CALCULATE' ? 'leave_proposal_calculation' : END,
    )
    .addEdge('leave_proposal_calculation', END)
    .compile();

  await graph.invoke({ route: 'CALCULATE' });
  if (!context.result) throw new Error('LEAVE_RESULT_MISSING');
  return {
    result: context.result,
    steps: context.steps,
    securityEvents: context.securityEvents,
    ...(context.approval ? { approval: context.approval } : {}),
  };
}
