import { ChatOpenAI } from '@langchain/openai';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { PrismaClient } from '@prisma/client';
import { AmqplibConnector } from './adapters/amqplib-connector';
import { DevelopmentManagerNotification } from './adapters/development-manager-notification';
import { NodeCronScheduler } from './adapters/node-cron-scheduler';
import {
  OpenAiGroundedKnowledgeAnswers,
  OpenAiKnowledgeEmbeddings,
} from './adapters/openai-knowledge.adapter';
import {
  buildOpenAiModelConfiguration,
  OpenAiHcmIntentNormalizer,
} from './adapters/openai-hcm-intent-normalizer';
import { createApp } from './app';
import { loadEnvironment } from './config/load-environment';
import { AgentController } from './controllers/agent.controller';
import { HealthController } from './controllers/health.controller';
import { KnowledgeController } from './controllers/knowledge.controller';
import { McpController } from './controllers/mcp.controller';
import { todayAsDateOnly } from './helpers/onboarding-agent.helpers';
import { createLangSmithAgentTraceRecorder } from './observability/langsmith-agent-trace-recorder';
import { PinoApplicationLogger } from './observability/pino-application-logger';
import { PrismaAgentRunRepository } from './repositories/agent-run.repository';
import { PrismaEmployeeRepository } from './repositories/employee.repository';
import { PrismaKnowledgeRepository } from './repositories/knowledge.repository';
import { PrismaLeaveRepository } from './repositories/leave.repository';
import { PrismaProcessedEventRepository } from './repositories/processed-event.repository';
import { KnowledgeIngestionService } from './services/knowledge-ingestion.service';
import { KnowledgeQueryService } from './services/knowledge-query.service';
import { OnboardingAgentService } from './services/onboarding-agent.service';
import { OnboardingTriggerProcessor } from './services/onboarding-trigger-processor';
import { createTriggerControllers } from './triggers/create-trigger-controllers';
import { OnboardingScheduleTrigger } from './triggers/onboarding-schedule.trigger';
import { RabbitMqOnboardingTransport } from './triggers/rabbitmq-onboarding.transport';

async function startServer(): Promise<void> {
  const environment = loadEnvironment();
  const database = new PrismaClient();
  const checkpointer = PostgresSaver.fromConnString(environment.databaseUrl);
  let broker: RabbitMqOnboardingTransport | undefined;
  let schedule: OnboardingScheduleTrigger | undefined;

  try {
    await checkpointer.setup();

    const employees = new PrismaEmployeeRepository(database);
    const runRepository = new PrismaAgentRunRepository(database);
    let knowledgeQueries: KnowledgeQueryService | undefined;
    let knowledgeController = new KnowledgeController({
      employees,
      enabled: false,
    });
    if (environment.ragExternalProcessingEnabled) {
      const knowledgeRepository = new PrismaKnowledgeRepository(database);
      const knowledgeEmbeddings = new OpenAiKnowledgeEmbeddings({
        apiKey: environment.openAiApiKey,
        model: environment.openAiEmbeddingModel,
      });
      knowledgeQueries = new KnowledgeQueryService({
        repository: knowledgeRepository,
        embeddings: knowledgeEmbeddings,
        answers: new OpenAiGroundedKnowledgeAnswers({
          apiKey: environment.openAiApiKey,
          model: environment.openAiModel,
        }),
      });
      knowledgeController = new KnowledgeController({
        employees,
        enabled: true,
        queries: knowledgeQueries,
        ingestion: new KnowledgeIngestionService({
          repository: knowledgeRepository,
          embeddings: knowledgeEmbeddings,
          embeddingModel: environment.openAiEmbeddingModel,
        }),
      });
    }
    const onboardingAgent = new OnboardingAgentService({
      employees,
      leaves: new PrismaLeaveRepository(database),
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
      configuredModel: environment.openAiModel,
      ...(environment.langSmithTracing
        ? {
            traceRecorder: createLangSmithAgentTraceRecorder({
              apiKey: environment.langSmithApiKey as string,
              projectName: environment.langSmithProject,
            }),
          }
        : {}),
    });
    const processor = new OnboardingTriggerProcessor({
      events: new PrismaProcessedEventRepository(database),
      agent: onboardingAgent,
      automationActorEmployeeCode: environment.automationActorEmployeeCode,
    });
    broker = new RabbitMqOnboardingTransport({
      amqpUrl: environment.amqpUrl,
      connector: new AmqplibConnector(),
      processor,
      prefetch: environment.rabbitPrefetch,
      maxAttempts: environment.rabbitMaxAttempts,
    });
    await broker.start();

    schedule = new OnboardingScheduleTrigger({
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
    const logger = new PinoApplicationLogger();
    const agentController = new AgentController({
      agent: onboardingAgent,
      logger,
    });
    const mcpController = new McpController({
      employees,
      clock: { today: todayAsDateOnly },
      knowledgeQueries,
      logger,
    });
    const triggerControllers = createTriggerControllers({
      nodeEnv: environment.nodeEnv,
      processor,
      webhookApiKey: environment.webhookApiKey,
      publisher: broker,
    });
    const app = createApp([
      healthController,
      agentController,
      knowledgeController,
      mcpController,
      ...triggerControllers,
    ]);
    const server = app.listen(environment.port, () => {
      process.stdout.write(`API listening on port ${environment.port}\n`);
    });
    let shuttingDown = false;

    const shutdown = (signal: string): void => {
      if (shuttingDown) return;
      shuttingDown = true;
      process.stdout.write(`Received ${signal}; shutting down\n`);
      schedule?.stop();
      server.close(() => {
        void Promise.allSettled([broker?.close(), checkpointer.end(), database.$disconnect()]).then(
          () => {
            process.exit(0);
          },
        );
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    schedule?.stop();
    await Promise.allSettled([broker?.close(), checkpointer.end(), database.$disconnect()]);
    throw error;
  }
}

void startServer().catch(() => {
  process.stderr.write('API failed to start.\n');
  process.exitCode = 1;
});
