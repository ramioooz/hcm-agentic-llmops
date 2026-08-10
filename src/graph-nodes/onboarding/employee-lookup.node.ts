import { HcmAgentRoute } from '../../enums/hcm-agent.enum';
import { OnboardingGraphNode } from '../../enums/onboarding.enum';
import { SecurityEventType, SecuritySeverity } from '../../enums/security.enum';
import { createEmployeeLookupTool } from '../../tools/onboarding.tools';
import type { AgentEventSink } from '../../types/agent-event-sink';
import type { HcmAgentExecutionContext } from '../../types/hcm-agent-execution-context';
import type { HcmAgentGraphDependencies } from '../../types/hcm-agent-graph-dependencies';
import { buildFailureResult, emitToolEvent, safeErrorCode } from '../../helpers/hcm-agent.helpers';

export function createEmployeeLookupNode(
  dependencies: HcmAgentGraphDependencies,
  context: HcmAgentExecutionContext,
  emit: AgentEventSink,
) {
  const lookup = createEmployeeLookupTool(dependencies.employees);
  return async () => {
    const employeeCode = context.intent?.employeeCode;
    if (!employeeCode) throw new Error('GRAPH_EMPLOYEE_CODE_MISSING');
    try {
      context.lookup = await lookup.invoke({
        actorEmployeeCode: context.input.actorEmployeeCode,
        targetEmployeeCode: employeeCode,
      });
      context.steps.push({
        stepName: OnboardingGraphNode.EmployeeLookup,
        status: 'COMPLETED',
        outcomeCode: 'EMPLOYEE_FOUND_AND_AUTHORIZED',
        inputData: { employeeCode },
      });
      emitToolEvent(
        emit,
        context.runId,
        OnboardingGraphNode.EmployeeLookup,
        'completed',
        'EMPLOYEE_FOUND_AND_AUTHORIZED',
      );
      return {
        route: HcmAgentRoute.Calculate,
        lastNode: OnboardingGraphNode.EmployeeLookup,
        outcomeCode: 'EMPLOYEE_FOUND_AND_AUTHORIZED',
      };
    } catch (error) {
      const code = safeErrorCode(error);
      const response =
        code === 'AUTHENTICATION_REQUIRED'
          ? ([401, 'Identity was not found.'] as const)
          : code === 'EMPLOYEE_NOT_FOUND'
            ? ([404, `Employee ${employeeCode} was not found.`] as const)
            : code === 'AUTHORIZATION_DENIED'
              ? ([403, 'You are not authorized to perform this operation.'] as const)
              : ([500, 'The workflow could not be completed.'] as const);
      context.steps.push({
        stepName: OnboardingGraphNode.EmployeeLookup,
        status: 'FAILED',
        outcomeCode: code,
      });
      if (code === 'AUTHORIZATION_DENIED') {
        context.securityEvents.push({
          eventType: SecurityEventType.AuthorizationDenied,
          severity: SecuritySeverity.Medium,
        });
      }
      context.result = buildFailureResult(context, response[0], code, response[1]);
      emitToolEvent(emit, context.runId, OnboardingGraphNode.EmployeeLookup, 'failed', code);
      return {
        route: HcmAgentRoute.Respond,
        lastNode: OnboardingGraphNode.EmployeeLookup,
        outcomeCode: code,
      };
    }
  };
}
