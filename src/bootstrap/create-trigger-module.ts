import { AmqplibConnector } from '../adapters/amqplib-connector';
import { NodeCronScheduler } from '../adapters/node-cron-scheduler';
import { PrismaEmployeeRepository } from '../repositories/employee.repository';
import { PrismaProcessedEventRepository } from '../repositories/processed-event.repository';
import { OnboardingTriggerProcessor } from '../services/onboarding-trigger-processor';
import { createTriggerControllers } from '../triggers/create-trigger-controllers';
import { OnboardingScheduleTrigger } from '../triggers/onboarding-schedule.trigger';
import { RabbitMqOnboardingTransport } from '../triggers/rabbitmq-onboarding.transport';
import type { AgentInvoker } from '../types/agent-invoker';
import type { ApplicationEnvironment } from '../types/application-environment';
import type { ApplicationLogger } from '../types/application-logger';

export function createTriggerModule(input: {
  environment: ApplicationEnvironment;
  employees: PrismaEmployeeRepository;
  processedEvents: PrismaProcessedEventRepository;
  agent: AgentInvoker;
  logger: ApplicationLogger;
}) {
  const processor = new OnboardingTriggerProcessor({
    events: input.processedEvents,
    agent: input.agent,
    automationActorEmployeeCode: input.environment.automationActorEmployeeCode,
  });
  const broker = new RabbitMqOnboardingTransport({
    amqpUrl: input.environment.amqpUrl,
    connector: new AmqplibConnector(),
    processor,
    logger: input.logger,
    prefetch: input.environment.rabbitPrefetch,
    maxAttempts: input.environment.rabbitMaxAttempts,
  });
  const schedule = new OnboardingScheduleTrigger({
    enabled: input.environment.schedulerEnabled,
    scheduler: new NodeCronScheduler(),
    candidates: input.employees,
    processor,
    clock: { now: () => new Date() },
  });

  return {
    controllers: createTriggerControllers({
      nodeEnv: input.environment.nodeEnv,
      processor,
      webhookApiKey: input.environment.webhookApiKey,
      publisher: broker,
    }),
    start: async (): Promise<void> => {
      await broker.start();
      schedule.start();
    },
    stopScheduling: (): void => schedule.stop(),
    close: (): Promise<void> => broker.close(),
  };
}
