import { CommonErrorCode, LeaveErrorCode } from '../../enums/error.enum';
import { HcmAgentRoute, HcmIntentType } from '../../enums/hcm-agent.enum';
import { LeaveGraphNode } from '../../enums/leave.enum';
import { SecurityEventType, SecuritySeverity } from '../../enums/security.enum';
import { createLeaveBalanceTool, createLeavePolicyTool } from '../../tools/leave.tools';
import type { AgentEventSink } from '../../types/agent-event-sink';
import type { HcmAgentExecutionContext } from '../../types/hcm-agent-execution-context';
import type { HcmAgentGraphDependencies } from '../../types/hcm-agent-graph-dependencies';
import { buildFailureResult } from '../../helpers/hcm-agent.helpers';
import { resolveApplicationErrorCode } from '../../helpers/application-error.helpers';

function safeLeaveError(error: unknown): {
  code: string;
  httpStatus: number;
  message: string;
} {
  const code = resolveApplicationErrorCode(error, CommonErrorCode.InternalError);
  if (code === CommonErrorCode.AuthenticationRequired) {
    return { code, httpStatus: 401, message: 'Identity was not found.' };
  }
  if (code === CommonErrorCode.AuthorizationDenied) {
    return { code, httpStatus: 403, message: 'You are not authorized to perform this operation.' };
  }
  if (code === CommonErrorCode.EmployeeNotFound) {
    return { code, httpStatus: 404, message: 'The employee was not found.' };
  }
  if (code === CommonErrorCode.EmployeeInactive) {
    return { code, httpStatus: 409, message: 'The employee is not active.' };
  }
  if (code === LeaveErrorCode.PolicyNotFound || code === LeaveErrorCode.BalanceNotFound) {
    return { code, httpStatus: 404, message: 'Annual leave information was not found.' };
  }
  if (code === LeaveErrorCode.InvalidDates) {
    return { code, httpStatus: 400, message: 'Provide a valid leave date range.' };
  }
  return {
    code: CommonErrorCode.InternalError,
    httpStatus: 500,
    message: 'The workflow could not be completed.',
  };
}

export async function loadLeaveContext(
  dependencies: HcmAgentGraphDependencies,
  context: HcmAgentExecutionContext,
  emit: AgentEventSink,
  targetEmployeeCode: string,
  startDate: string,
): Promise<boolean> {
  if (!dependencies.leaves) {
    context.result = buildFailureResult(
      context,
      500,
      'INTERNAL_ERROR',
      'The workflow could not be completed.',
    );
    return false;
  }
  const policyTool = createLeavePolicyTool(dependencies.employees, dependencies.leaves);
  const balanceTool = createLeaveBalanceTool(dependencies.employees, dependencies.leaves);
  try {
    const [policy, balance] = await Promise.all([
      policyTool.invoke({
        actorEmployeeCode: context.input.actorEmployeeCode,
        targetEmployeeCode,
      }),
      balanceTool.invoke({
        actorEmployeeCode: context.input.actorEmployeeCode,
        targetEmployeeCode,
        year: Number(startDate.slice(0, 4)),
      }),
    ]);
    context.leavePolicy = policy;
    context.leaveBalance = balance;
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
        runId: context.runId,
        tool: 'leave_policy_lookup',
        status: 'completed',
        outcomeCode: 'LEAVE_POLICY_FOUND',
      },
    });
    emit({
      event: 'tool',
      data: {
        runId: context.runId,
        tool: 'leave_balance_lookup',
        status: 'completed',
        outcomeCode: 'LEAVE_BALANCE_FOUND',
      },
    });
    return true;
  } catch (error) {
    const failure = safeLeaveError(error);
    context.steps.push({
      stepName: 'leave_context_lookup',
      status: failure.code === CommonErrorCode.AuthorizationDenied ? 'REJECTED' : 'FAILED',
      outcomeCode: failure.code,
    });
    if (failure.code === CommonErrorCode.AuthorizationDenied) {
      context.securityEvents.push({
        eventType: SecurityEventType.AuthorizationDenied,
        severity: SecuritySeverity.Medium,
      });
    }
    context.result = buildFailureResult(context, failure.httpStatus, failure.code, failure.message);
    return false;
  }
}

export function createLeaveContextNode(
  dependencies: HcmAgentGraphDependencies,
  context: HcmAgentExecutionContext,
  emit: AgentEventSink,
) {
  return async () => {
    const intent = context.intent;
    if (
      intent?.intent !== HcmIntentType.LeaveRequest ||
      !intent.leaveStartDate ||
      !intent.leaveEndDate
    ) {
      context.result = buildFailureResult(
        context,
        500,
        'INTERNAL_ERROR',
        'The workflow could not be completed.',
      );
      return { route: HcmAgentRoute.Respond };
    }
    const loaded = await loadLeaveContext(
      dependencies,
      context,
      emit,
      intent.employeeCode ?? context.input.actorEmployeeCode,
      intent.leaveStartDate,
    );
    return {
      route: loaded ? HcmAgentRoute.Calculate : HcmAgentRoute.Respond,
      lastNode: LeaveGraphNode.Context,
      outcomeCode: loaded ? 'LEAVE_CONTEXT_READY' : (context.result?.body.code ?? 'INTERNAL_ERROR'),
    };
  };
}
