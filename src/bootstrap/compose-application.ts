import { createApp } from '../app';
import { HealthController } from '../controllers/health.controller';
import { McpController } from '../controllers/mcp.controller';
import { todayAsDateOnly } from '../helpers/onboarding-agent.helpers';
import type { ApplicationEnvironment } from '../types/application-environment';
import type { ApplicationRuntime } from '../types/application-runtime';
import { createAgentModule } from './create-agent-module';
import { createApplicationRuntime } from './application-runtime';
import { createCoreDependencies } from './create-core-dependencies';
import { createKnowledgeModule } from './create-knowledge-module';
import { createTriggerModule } from './create-trigger-module';

export function composeApplication(environment: ApplicationEnvironment): ApplicationRuntime {
  const core = createCoreDependencies(environment);
  const knowledge = createKnowledgeModule({
    environment,
    database: core.database,
    employees: core.employees,
    runs: core.runs,
    logger: core.logger,
  });
  const agent = createAgentModule({
    environment,
    employees: core.employees,
    runs: core.runs,
    leaves: core.leaves,
    logger: core.logger,
    checkpointer: core.checkpointer,
  });
  const triggers = createTriggerModule({
    environment,
    employees: core.employees,
    processedEvents: core.processedEvents,
    agent: agent.agent,
  });
  const healthController = new HealthController(async () => {
    await core.database.$queryRaw`SELECT 1`;
  });
  const mcpController = new McpController({
    employees: core.employees,
    clock: { today: todayAsDateOnly },
    knowledgeQueries: knowledge.queries,
    logger: core.logger,
  });
  const app = createApp([
    healthController,
    agent.agentController,
    agent.leaveRequestController,
    knowledge.controller,
    mcpController,
    ...triggers.controllers,
  ]);

  return createApplicationRuntime({
    initializeCore: core.initialize,
    startTriggers: triggers.start,
    stopScheduling: triggers.stopScheduling,
    listen: () => app.listen(environment.port),
    closeTriggers: triggers.close,
    closeCore: core.close,
  });
}
