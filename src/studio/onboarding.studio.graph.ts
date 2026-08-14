import { assertAutomaticTracingDisabled } from '../observability/automatic-tracing-guard';
import { createOnboardingGraph } from '../graphs/onboarding.graph';
import { createStudioExecutionContext, createStudioScenario } from './hcm-agent.studio-scenarios';

assertAutomaticTracingDisabled(process.env);

export function createOnboardingStudioGraph() {
  const definition = createStudioScenario('notification');
  return createOnboardingGraph(
    definition.dependencies,
    createStudioExecutionContext(definition),
    () => undefined,
  );
}
