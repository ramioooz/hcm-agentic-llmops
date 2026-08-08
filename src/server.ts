import { PrismaClient } from '@prisma/client';
import { createApp } from './app';
import { loadEnvironment } from './config/load-environment';
import { AgentController } from './controllers/agent.controller';
import { HealthController } from './controllers/health.controller';
import { todayAsDateOnly } from './helpers/onboarding-agent.helpers';
import { PrismaAgentRunRepository } from './repositories/agent-run.repository';
import { PrismaEmployeeRepository } from './repositories/employee.repository';
import { OnboardingAgentService } from './services/onboarding-agent.service';
import { OpenAiHcmIntentNormalizer } from './services/openai-hcm-intent-normalizer.service';
import { PinoApplicationLogger } from './observability/pino-application-logger';

const environment = loadEnvironment();
const database = new PrismaClient();
const onboardingAgent = new OnboardingAgentService({
  employees: new PrismaEmployeeRepository(database),
  clock: {
    today: todayAsDateOnly,
  },
  recorder: new PrismaAgentRunRepository(database),
  normalizer: new OpenAiHcmIntentNormalizer({
    apiKey: environment.openAiApiKey,
    model: environment.openAiModel,
  }),
});
const healthController = new HealthController(async () => {
  await database.$queryRaw`SELECT 1`;
});
const agentController = new AgentController({
  agent: onboardingAgent,
  logger: new PinoApplicationLogger(),
});
const app = createApp([healthController, agentController]);

const server = app.listen(environment.port, () => {
  process.stdout.write(`API listening on port ${environment.port}\n`);
});

async function shutdown(signal: string): Promise<void> {
  process.stdout.write(`Received ${signal}; shutting down\n`);
  server.close(async () => {
    await database.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
