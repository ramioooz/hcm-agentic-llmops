import { PrismaClient } from '@prisma/client';
import {
  OpenAiGroundedKnowledgeAnswers,
  OpenAiKnowledgeEmbeddings,
} from '../adapters/openai-knowledge.adapter';
import { KnowledgeController } from '../controllers/knowledge.controller';
import { createLangSmithRagTraceRecorder } from '../observability/langsmith-rag-trace-recorder';
import { PinoApplicationLogger } from '../observability/pino-application-logger';
import { PrismaAgentRunRepository } from '../repositories/agent-run.repository';
import { PrismaEmployeeRepository } from '../repositories/employee.repository';
import { PrismaKnowledgeRepository } from '../repositories/knowledge.repository';
import { KnowledgeQueryService } from '../services/knowledge-query.service';
import { KnowledgeSecurityService } from '../services/knowledge-security.service';
import type { ApplicationEnvironment } from '../types/application-environment';

export function createKnowledgeModule(input: {
  environment: ApplicationEnvironment;
  database: PrismaClient;
  employees: PrismaEmployeeRepository;
  runs: PrismaAgentRunRepository;
  logger: PinoApplicationLogger;
}): { controller: KnowledgeController; queries: KnowledgeQueryService | undefined } {
  const security = new KnowledgeSecurityService({ recorder: input.runs, logger: input.logger });
  if (!input.environment.ragExternalProcessingEnabled) {
    return {
      controller: new KnowledgeController({ employees: input.employees, enabled: false }),
      queries: undefined,
    };
  }

  const repository = new PrismaKnowledgeRepository(input.database);
  const embeddings = new OpenAiKnowledgeEmbeddings({
    apiKey: input.environment.openAiApiKey,
    model: input.environment.openAiEmbeddingModel,
  });
  const recorder = input.environment.langSmithRagTracing
    ? createLangSmithRagTraceRecorder({
        apiKey: input.environment.langSmithApiKey as string,
        projectName: input.environment.langSmithProject,
      })
    : undefined;
  const queries = new KnowledgeQueryService({
    repository,
    embeddings,
    answers: new OpenAiGroundedKnowledgeAnswers({
      apiKey: input.environment.openAiApiKey,
      model: input.environment.openAiModel,
    }),
    security,
    ...(recorder
      ? {
          tracing: {
            recorder,
            logger: input.logger,
            embeddingModel: input.environment.openAiEmbeddingModel,
            answerModel: input.environment.openAiModel,
          },
        }
      : {}),
  });

  return {
    controller: new KnowledgeController({
      employees: input.employees,
      enabled: true,
      queries,
    }),
    queries,
  };
}
