import { readFileSync } from 'node:fs';
import { createHcmAgentStudioGraph } from '../../src/studio/hcm-agent.studio.graph';
import { createLeaveStudioGraph } from '../../src/studio/leave.studio.graph';
import { createOnboardingStudioGraph } from '../../src/studio/onboarding.studio.graph';

type LangGraphConfiguration = { graphs: Record<string, string> };

describe('LangGraph Studio production export', () => {
  it('exposes the HCM root graph and both domain subgraphs', () => {
    const configuration = JSON.parse(
      readFileSync('langgraph.json', 'utf8'),
    ) as LangGraphConfiguration;
    expect(configuration.graphs).toEqual({
      hcm_agent: './src/studio/hcm-agent.studio.graph.ts:createHcmAgentStudioGraph',
      onboarding: './src/studio/onboarding.studio.graph.ts:createOnboardingStudioGraph',
      leave: './src/studio/leave.studio.graph.ts:createLeaveStudioGraph',
    });

    const rootNodes = Object.keys(createHcmAgentStudioGraph().getGraph().nodes);
    const expandedRootNodes = Object.keys(
      createHcmAgentStudioGraph().getGraph({ xray: true }).nodes,
    );
    const onboardingNodes = Object.keys(createOnboardingStudioGraph().getGraph().nodes);
    const leaveNodes = Object.keys(createLeaveStudioGraph().getGraph().nodes);

    expect(rootNodes).toEqual(
      expect.arrayContaining([
        'request_guard',
        'intent_normalization',
        'routing',
        'onboarding',
        'leave',
        'response_audit',
      ]),
    );
    expect(expandedRootNodes).toEqual(
      expect.arrayContaining([
        'onboarding:employee_lookup',
        'onboarding:onboarding_calculation',
        'onboarding:manager_notification',
        'leave:parallel_leave_context',
        'leave:leave_proposal_calculation',
        'leave:leave_approval',
      ]),
    );
    expect(onboardingNodes).toEqual(
      expect.arrayContaining(['employee_lookup', 'onboarding_calculation', 'manager_notification']),
    );
    expect(leaveNodes).toEqual(
      expect.arrayContaining([
        'parallel_leave_context',
        'leave_proposal_calculation',
        'leave_approval',
      ]),
    );
  });
});
