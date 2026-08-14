import { assertAutomaticTracingDisabled } from '../observability/automatic-tracing-guard';
import { createLeaveGraph } from '../graphs/leave.graph';
import { createStudioExecutionContext, createStudioScenario } from './hcm-agent.studio-scenarios';

assertAutomaticTracingDisabled(process.env);

export function createLeaveStudioGraph() {
  const definition = createStudioScenario('leave');
  return createLeaveGraph(
    definition.dependencies,
    createStudioExecutionContext(definition),
    () => undefined,
  );
}
