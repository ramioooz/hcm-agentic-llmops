import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { OpenAiKnowledgeEmbeddings } from '../adapters/openai-knowledge.adapter';
import { loadEnvironment } from '../config/load-environment';
import { PinoApplicationLogger } from '../observability/pino-application-logger';
import { PrismaAgentRunRepository } from '../repositories/agent-run.repository';
import { PrismaKnowledgeRepository } from '../repositories/knowledge.repository';
import { KnowledgeDirectoryIndexer } from '../services/knowledge-directory-indexer.service';
import { KnowledgeIngestionService } from '../services/knowledge-ingestion.service';
import { KnowledgeSecurityService } from '../services/knowledge-security.service';

async function indexKnowledge(): Promise<void> {
  const environment = loadEnvironment();
  if (!environment.ragExternalProcessingEnabled) {
    throw new Error('RAG_EXTERNAL_PROCESSING_DISABLED');
  }
  const database = new PrismaClient();
  try {
    const runs = new PrismaAgentRunRepository(database);
    const security = new KnowledgeSecurityService({
      recorder: runs,
      logger: new PinoApplicationLogger(),
    });
    const repository = new PrismaKnowledgeRepository(database);
    const ingestion = new KnowledgeIngestionService({
      repository,
      embeddings: new OpenAiKnowledgeEmbeddings({
        apiKey: environment.openAiApiKey,
        model: environment.openAiEmbeddingModel,
      }),
      embeddingModel: environment.openAiEmbeddingModel,
      security,
    });
    const indexer = new KnowledgeDirectoryIndexer({
      repositoryRoot: process.cwd(),
      actorEmployeeCode: environment.automationActorEmployeeCode,
      correlationId: randomUUID(),
      repository,
      ingestion,
    });
    const results = await indexer.indexDirectory(resolve(process.cwd(), 'knowledge-documents'));
    for (const result of results) process.stdout.write(`${JSON.stringify(result)}\n`);
    const summary = results.reduce<Record<string, number>>(
      (counts, result) => ({ ...counts, [result.status]: (counts[result.status] ?? 0) + 1 }),
      {},
    );
    process.stdout.write(`${JSON.stringify({ status: 'SUMMARY', ...summary })}\n`);
    if (summary.FAILED) process.exitCode = 1;
  } finally {
    await database.$disconnect();
  }
}

void indexKnowledge().catch((error) => {
  const code = error instanceof Error ? error.message : 'KNOWLEDGE_INDEX_FAILED';
  process.stderr.write(`${JSON.stringify({ status: 'FAILED', code })}\n`);
  process.exitCode = 1;
});
