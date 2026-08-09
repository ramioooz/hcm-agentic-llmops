import { ChatOpenAI } from '@langchain/openai';
import { PrismaClient } from '@prisma/client';
import { AmqplibConnector } from './adapters/amqplib-connector';
import { DevelopmentManagerNotification } from './adapters/development-manager-notification';
import { NodeCronScheduler } from './adapters/node-cron-scheduler';
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
import { PrismaProcessedEventRepository } from './repositories/processed-event.repository';
import { OnboardingAgentService } from './services/onboarding-agent.service';
import { OnboardingTriggerProcessor } from './services/onboarding-trigger-processor';
import { createTriggerControllers } from './triggers/create-trigger-controllers';
import { OnboardingScheduleTrigger } from './triggers/onboarding-schedule.trigger';
import { RabbitMqOnboardingTransport } from './triggers/rabbitmq-onboarding.transport';

async function main(): Promise<void> {
  const environment = loadEnvironment();
  const database = new PrismaClient();
  const employees = new PrismaEmployeeRepository(database);
  const onboardingAgent = new OnboardingAgentService({
    employees,
    clock: { today: todayAsDateOnly },
    recorder: new PrismaAgentRunRepository(database),
    notifications: new DevelopmentManagerNotification(),
    normalizer: new OpenAiHcmIntentNormalizer(
      new ChatOpenAI(
        buildOpenAiModelConfiguration({
          apiKey: environment.openAiApiKey,
          model: environment.openAiModel,
        }),
      ),
    ),
  });
  const processor = new OnboardingTriggerProcessor({
    events: new PrismaProcessedEventRepository(database),
    agent: onboardingAgent,
    automationActorEmployeeCode: environment.automationActorEmployeeCode,
  });
  const broker = new RabbitMqOnboardingTransport({
    amqpUrl: environment.amqpUrl,
    connector: new AmqplibConnector(),
    processor,
    prefetch: environment.rabbitPrefetch,
    maxAttempts: environment.rabbitMaxAttempts,
  });
  await broker.start();

  const schedule = new OnboardingScheduleTrigger({
    enabled: environment.schedulerEnabled,
    scheduler: new NodeCronScheduler(),
    candidates: employees,
    processor,
    clock: { now: () => new Date() },
  });
  schedule.start();

  const healthController = new HealthController(async () => {
    await database.$queryRaw`SELECT 1`;
  });
  const agentController = new AgentController({
    agent: onboardingAgent,
    logger: new PinoApplicationLogger(),
  });
  const triggerControllers = createTriggerControllers({
    nodeEnv: environment.nodeEnv,
    processor,
    webhookApiKey: environment.webhookApiKey,
    publisher: broker,
  });
  const app = createApp([healthController, agentController, ...triggerControllers]);
  const server = app.listen(environment.port, () => {
    process.stdout.write(`API listening on port ${environment.port}\n`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`Received ${signal}; shutting down\n`);
    schedule.stop();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await broker.close();
    await database.$disconnect();
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

void main().catch(() => {
  process.stderr.write('API startup failed\n');
  process.exitCode = 1;
});
