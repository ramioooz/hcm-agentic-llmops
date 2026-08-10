import { assertAutomaticTracingDisabled } from '../observability/automatic-tracing-guard';
import { createHcmAgentGraphForExecution } from '../services/hcm-agent-runner.service';
import { createStudioScenario, type StudioScenario } from './onboarding.studio-scenarios';

assertAutomaticTracingDisabled(process.env);

function createStudioGraph(scenario: StudioScenario) {
  const definition = createStudioScenario(scenario);
  return createHcmAgentGraphForExecution(
    definition.dependencies,
    definition.input,
    definition.runId,
    { agentServerManagedCheckpointer: true },
  );
}

export const createReviewStudioGraph = () => createStudioGraph('review');
export const createMissingDataStudioGraph = () => createStudioGraph('missing-data');
export const createUnsupportedStudioGraph = () => createStudioGraph('unsupported');
export const createUnsafeStudioGraph = () => createStudioGraph('unsafe');
export const createAuthorizationDeniedStudioGraph = () => createStudioGraph('authorization-denied');
export const createNotificationStudioGraph = () => createStudioGraph('notification');
export const createToolFailureStudioGraph = () => createStudioGraph('tool-failure');
