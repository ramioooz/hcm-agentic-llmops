import { assertAutomaticTracingDisabled } from '../observability/automatic-tracing-guard';
import { createOnboardingGraphForExecution } from '../workflows/onboarding/onboarding.graph';
import { createStudioScenario, type StudioScenario } from './onboarding.studio-scenarios';

assertAutomaticTracingDisabled(process.env);

function createStudioGraph(scenario: StudioScenario) {
  const definition = createStudioScenario(scenario);
  return createOnboardingGraphForExecution(
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
