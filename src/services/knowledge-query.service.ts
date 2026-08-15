import { RagTraceBuilder } from '../observability/rag-trace-builder';
import { KnowledgeErrorCode } from '../enums/error.enum';
import { ApplicationError } from '../errors/application.error';
import { resolveApplicationErrorCode } from '../helpers/application-error.helpers';
import type {
  KnowledgeAnswerGenerator,
  KnowledgeEmbeddingProvider,
  KnowledgeQueryResult,
  KnowledgeRepository,
} from '../types/knowledge';
import type { ApplicationLogger } from '../types/application-logger';
import type { KnowledgeSecurityContext } from '../types/knowledge-security-context';
import type { RagTrace } from '../types/rag-trace';
import type { RagTraceRecorder } from '../types/rag-trace-recorder';
import type { RagTraceStage } from '../types/rag-trace-stage';
import type { KnowledgeSecurityService } from './knowledge-security.service';

const INSUFFICIENT_EVIDENCE: KnowledgeQueryResult = {
  status: 'INSUFFICIENT_EVIDENCE',
  answer: 'Insufficient evidence in the indexed HR knowledge documents.',
  sources: [],
};
const MINIMUM_COSINE_SIMILARITY = 0.5;
const absoluteUrlPattern = /https?:\/\/[^\s<>()"']+/gi;

function absoluteUrls(text: string): string[] {
  return text.match(absoluteUrlPattern) ?? [];
}

function stableFailureCode(error: unknown): KnowledgeErrorCode {
  const code = resolveApplicationErrorCode(error, KnowledgeErrorCode.QueryFailed);
  return code === KnowledgeErrorCode.UnsafeQuery
    ? KnowledgeErrorCode.UnsafeQuery
    : KnowledgeErrorCode.QueryFailed;
}

async function runStage<T>(input: {
  trace?: RagTraceBuilder;
  name: RagTraceStage['name'];
  inputs?: Record<string, unknown>;
  operation: () => Promise<T>;
  outputs: (result: T) => Record<string, unknown>;
  completion?: (result: T) => {
    outputs?: Record<string, unknown>;
    status?: RagTraceStage['status'];
    failureCode?: string;
  };
}): Promise<T> {
  const stage = input.trace?.startStage(input.name, input.inputs);
  try {
    const result = await input.operation();
    stage?.complete(input.completion?.(result) ?? { outputs: input.outputs(result) });
    return result;
  } catch (error) {
    stage?.complete({
      status: 'FAILED',
      failureCode: stableFailureCode(error),
    });
    throw error;
  }
}

export class KnowledgeQueryService {
  public constructor(
    private readonly dependencies: {
      repository: Pick<KnowledgeRepository, 'searchActiveChunks'>;
      embeddings: Pick<KnowledgeEmbeddingProvider, 'embedQuery'>;
      answers: KnowledgeAnswerGenerator;
      security: Pick<KnowledgeSecurityService, 'inspect' | 'record'>;
      tracing?: {
        recorder: RagTraceRecorder;
        logger: ApplicationLogger;
        embeddingModel: string;
        answerModel: string;
        now?: () => number;
      };
    },
  ) {}

  public async query(input: {
    query: string;
    documentId?: string;
    limit?: number;
    securityContext: KnowledgeSecurityContext;
  }): Promise<KnowledgeQueryResult> {
    const query = input.query.trim();
    if (!query || query.length > 2_000) {
      throw new ApplicationError(KnowledgeErrorCode.QueryInvalid);
    }

    const limit = Math.min(8, Math.max(1, input.limit ?? 5));
    const trace = this.createTrace(input, query, limit);
    const inspectionContext = {
      correlationId: input.securityContext.correlationId,
      actorEmployeeCode: input.securityContext.actorEmployeeCode,
    };

    try {
      const queryRisk = await runStage({
        trace,
        name: 'rag.query_guard',
        inputs: { question: query },
        operation: () =>
          this.dependencies.security.inspect({
            text: query,
            source: 'KNOWLEDGE_QUERY',
            ...inspectionContext,
          }),
        outputs: (result) => result,
        completion: (result) => ({
          outputs: result,
          status: result.safe ? 'COMPLETED' : 'REJECTED',
          ...(!result.safe ? { failureCode: result.reasonCode } : {}),
        }),
      });
      if (!queryRisk.safe) throw new ApplicationError(KnowledgeErrorCode.UnsafeQuery);

      const embedding = await runStage({
        trace,
        name: 'rag.query_embedding',
        inputs: { question: query },
        operation: () => this.dependencies.embeddings.embedQuery(query),
        outputs: (result) => ({ dimensions: result.length }),
      });
      const retrieved = await runStage({
        trace,
        name: 'rag.vector_retrieval',
        inputs: { documentId: input.documentId, limit },
        operation: () =>
          this.dependencies.repository.searchActiveChunks({
            embedding,
            documentId: input.documentId,
            limit,
          }),
        outputs: (chunks) => ({
          chunks: chunks.map((chunk) => ({
            documentId: chunk.documentId,
            chunkId: chunk.chunkId,
            chunkIndex: chunk.chunkIndex,
            pageNumber: chunk.pageNumber,
            score: chunk.score,
          })),
        }),
      });
      trace?.setRetrievedChunks(retrieved);

      const evidence = retrieved
        .filter((chunk) => chunk.score >= MINIMUM_COSINE_SIMILARITY)
        .slice(0, limit);
      if (evidence.length === 0) return this.finish(trace, INSUFFICIENT_EVIDENCE);

      const evidenceGuard = trace?.startStage('rag.evidence_guard', {
        chunkIds: evidence.map((chunk) => chunk.chunkId),
      });
      for (const chunk of evidence) {
        const evidenceRisk = await this.dependencies.security.inspect({
          text: chunk.content,
          source: 'RETRIEVED_EVIDENCE',
          ...inspectionContext,
          metadata: {
            documentId: chunk.documentId,
            chunkId: chunk.chunkId,
            chunkIndex: chunk.chunkIndex,
            pageNumber: chunk.pageNumber,
          },
        });
        if (!evidenceRisk.safe) {
          evidenceGuard?.complete({
            status: 'REJECTED',
            failureCode: evidenceRisk.reasonCode,
            outputs: { safe: false, rejectedChunkId: chunk.chunkId },
          });
          return this.finish(trace, INSUFFICIENT_EVIDENCE, evidenceRisk.reasonCode);
        }
      }
      evidenceGuard?.complete({ outputs: { safe: true, inspectedChunks: evidence.length } });

      const generated = await runStage({
        trace,
        name: 'rag.grounded_answer',
        inputs: { question: query, chunkIds: evidence.map((chunk) => chunk.chunkId) },
        operation: () => this.dependencies.answers.generate({ query, evidence }),
        outputs: (result) => ({
          answer: result.answer,
          citedChunkIds: result.citedChunkIds,
        }),
      });

      const outputValidation = trace?.startStage('rag.output_validation', {
        answer: generated.answer,
        citedChunkIds: generated.citedChunkIds,
      });
      const outputRisk = await this.dependencies.security.inspect({
        text: generated.answer,
        source: 'MODEL_OUTPUT',
        ...inspectionContext,
      });
      if (!outputRisk.safe) {
        outputValidation?.complete({
          status: 'REJECTED',
          failureCode: outputRisk.reasonCode,
          outputs: { safe: false },
        });
        return this.finish(trace, INSUFFICIENT_EVIDENCE, outputRisk.reasonCode);
      }

      const cited = new Set(generated.citedChunkIds);
      const citedEvidence = evidence.filter((chunk) => cited.has(chunk.chunkId));
      const sources = citedEvidence.map((chunk) => ({
        documentId: chunk.documentId,
        documentTitle: chunk.documentTitle,
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        pageNumber: chunk.pageNumber,
      }));
      if (!generated.answer.trim() || sources.length === 0) {
        outputValidation?.complete({
          status: 'REJECTED',
          failureCode: 'INSUFFICIENT_EVIDENCE',
          outputs: { safe: true, validCitations: false },
        });
        return this.finish(trace, INSUFFICIENT_EVIDENCE, 'INSUFFICIENT_EVIDENCE');
      }

      const evidenceUrls = new Set(citedEvidence.flatMap((chunk) => absoluteUrls(chunk.content)));
      const ungroundedUrl = absoluteUrls(generated.answer).find((url) => !evidenceUrls.has(url));
      if (ungroundedUrl) {
        await this.dependencies.security.record({
          text: generated.answer,
          source: 'MODEL_OUTPUT',
          reasonCode: 'UNGROUNDED_EXTERNAL_URL',
          ...inspectionContext,
          metadata: {
            documentId: citedEvidence[0]?.documentId,
            chunkId: citedEvidence[0]?.chunkId,
            chunkIndex: citedEvidence[0]?.chunkIndex,
            pageNumber: citedEvidence[0]?.pageNumber,
          },
        });
        outputValidation?.complete({
          status: 'REJECTED',
          failureCode: 'UNGROUNDED_EXTERNAL_URL',
          outputs: { safe: false, validCitations: true, groundedUrls: false },
        });
        return this.finish(trace, INSUFFICIENT_EVIDENCE, 'UNGROUNDED_EXTERNAL_URL');
      }

      const result: KnowledgeQueryResult = {
        status: 'ANSWERED',
        answer: generated.answer.trim(),
        sources,
      };
      outputValidation?.complete({
        outputs: { safe: true, validCitations: true, groundedUrls: true, sources },
      });
      return this.finish(trace, result);
    } catch (error) {
      const failureCode = stableFailureCode(error);
      await this.submitTrace(
        trace?.build({
          answer: null,
          resultStatus: failureCode === KnowledgeErrorCode.UnsafeQuery ? 'REJECTED' : 'FAILED',
          failureCode,
        }),
      );
      throw error;
    }
  }

  private createTrace(
    input: {
      documentId?: string;
      securityContext: KnowledgeSecurityContext;
    },
    question: string,
    limit: number,
  ): RagTraceBuilder | undefined {
    const tracing = this.dependencies.tracing;
    if (!tracing) return undefined;
    return new RagTraceBuilder({
      correlationId: input.securityContext.correlationId,
      actorEmployeeCode: input.securityContext.actorEmployeeCode,
      source: input.securityContext.requestSource,
      question,
      ...(input.documentId ? { documentId: input.documentId } : {}),
      limit,
      embeddingModel: tracing.embeddingModel,
      answerModel: tracing.answerModel,
      ...(tracing.now ? { now: tracing.now } : {}),
    });
  }

  private async finish(
    trace: RagTraceBuilder | undefined,
    result: KnowledgeQueryResult,
    failureCode: string | null = null,
  ): Promise<KnowledgeQueryResult> {
    await this.submitTrace(
      trace?.build({
        answer: result.answer,
        resultStatus: result.status,
        citations: result.sources,
        failureCode,
      }),
    );
    return result;
  }

  private async submitTrace(trace: RagTrace | undefined): Promise<void> {
    if (!trace || !this.dependencies.tracing) return;
    try {
      await this.dependencies.tracing.recorder.record(trace);
    } catch {
      this.dependencies.tracing.logger.warn({
        event: 'knowledge.trace.failed',
        correlationId: trace.correlationId,
        status: 'FAILED',
        code: KnowledgeErrorCode.LangSmithTraceFailed,
      });
    }
  }
}
