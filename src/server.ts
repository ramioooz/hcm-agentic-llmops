import { PrismaClient } from '@prisma/client';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { ChatOpenAI } from '@langchain/openai';
import { DevelopmentManagerNotification } from './adapters/development-manager-notification';
import {
  buildOpenAiModelConfiguration,
  OpenAiHcmIntentNormalizer,
} from './adapters/openai-hcm-intent-normalizer';
import { createApp } from './app';
import { loadEnvironment } from './config/load-environment';
import { AgentController } from './controllers/agent.controller';
import { HealthController } from './controllers/health.controller';
import { todayAsDateOnly } from './helpers/onboarding-agent.helpers';
import { PinoApplicationLogger } from './observability/pino-application-logger';
import { PrismaAgentRunRepository } from './repositories/agent-run.repository';
import { PrismaEmployeeRepository } from './repositories/employee.repository';
import { OnboardingAgentService } from './services/onboarding-agent.service';

async function startServer(): Promise<void> {
  const environment = loadEnvironment();
  const database = new PrismaClient();
  const checkpointer = PostgresSaver.fromConnString(environment.databaseUrl);

  try {
    await checkpointer.setup();

    const runRepository = new PrismaAgentRunRepository(database);
    const onboardingAgent = new OnboardingAgentService({
      employees: new PrismaEmployeeRepository(database),
      clock: { today: todayAsDateOnly },
      recorder: runRepository,
      threadOwnership: runRepository,
      notifications: new DevelopmentManagerNotification(),
      normalizer: new OpenAiHcmIntentNormalizer(
        new ChatOpenAI(
          buildOpenAiModelConfiguration({
            apiKey: environment.openAiApiKey,
            model: environment.openAiModel,
          }),
        ),
      ),
      checkpointer,
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
    let shuttingDown = false;

    const shutdown = (signal: string): void => {
      if (shuttingDown) return;
      shuttingDown = true;
      process.stdout.write(`Received ${signal}; shutting down\n`);
      server.close(() => {
        void Promise.allSettled([checkpointer.end(), database.$disconnect()]).then(() => {
          process.exit(0);
        });
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    await Promise.allSettled([checkpointer.end(), database.$disconnect()]);
    throw error;
  }
}

void startServer().catch(() => {
  process.stderr.write('API failed to start.\n');
  process.exitCode = 1;
});
