import { assertAutomaticTracingDisabled } from '../observability/automatic-tracing-guard';
import { createHcmAgentGraphForExecution } from '../services/hcm-agent-runner.service';
import { createStudioScenario } from './hcm-agent.studio-scenarios';

assertAutomaticTracingDisabled(process.env);

export function createHcmAgentStudioGraph() {
  const definition = createStudioScenario('review');
  return createHcmAgentGraphForExecution(
    definition.dependencies,
    definition.input,
    definition.runId,
    { agentServerManagedCheckpointer: true },
  );
}
