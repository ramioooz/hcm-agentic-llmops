import { randomUUID } from 'node:crypto';
import type { KnowledgeSource, RetrievedKnowledgeChunk } from '../types/knowledge';
import type { RagTrace } from '../types/rag-trace';
import type { RagTraceStage } from '../types/rag-trace-stage';

type StageCompletion = {
  outputs?: Record<string, unknown>;
  status?: RagTraceStage['status'];
  failureCode?: string;
};

export class RagTraceBuilder {
  private readonly traceId = randomUUID();
  private readonly startedAtMs: number;
  private readonly stages: RagTraceStage[] = [];
  private retrievedChunks: RagTrace['retrievedChunks'] = [];

  public constructor(
    private readonly input: {
      correlationId: string;
      actorEmployeeCode: string;
      source: RagTrace['source'];
      question: string;
      documentId?: string;
      candidateLimit: number;
      minimumSimilarity: number;
      evidenceLimit: number;
      embeddingModel: string;
      answerModel: string;
      now?: () => number;
    },
  ) {
    this.startedAtMs = this.now();
  }

  public startStage(name: RagTraceStage['name'], inputs: Record<string, unknown> = {}) {
    const id = randomUUID();
    const startedAtMs = this.now();
    let completed = false;

    return {
      complete: ({
        outputs = {},
        status = 'COMPLETED',
        failureCode,
      }: StageCompletion = {}): void => {
        if (completed) return;
        completed = true;
        this.stages.push({
          id,
          name,
          startedAtMs,
          endedAtMs: this.now(),
          status,
          inputs,
          outputs,
          ...(failureCode ? { failureCode } : {}),
        });
      },
    };
  }

  public setRetrievedChunks(chunks: RetrievedKnowledgeChunk[]): void {
    this.retrievedChunks = chunks.map((chunk) => ({
      documentId: chunk.documentId,
      chunkId: chunk.chunkId,
      chunkIndex: chunk.chunkIndex,
      pageNumber: chunk.pageNumber,
      score: chunk.score,
    }));
  }

  public build(input: {
    answer: string | null;
    resultStatus: RagTrace['resultStatus'];
    citations?: KnowledgeSource[];
    failureCode?: string | null;
  }): RagTrace {
    return {
      traceId: this.traceId,
      correlationId: this.input.correlationId,
      actorEmployeeCode: this.input.actorEmployeeCode,
      source: this.input.source,
      question: this.input.question,
      answer: input.answer,
      ...(this.input.documentId ? { documentId: this.input.documentId } : {}),
      candidateLimit: this.input.candidateLimit,
      minimumSimilarity: this.input.minimumSimilarity,
      evidenceLimit: this.input.evidenceLimit,
      embeddingModel: this.input.embeddingModel,
      answerModel: this.input.answerModel,
      retrievedChunks: this.retrievedChunks,
      citations: input.citations ?? [],
      resultStatus: input.resultStatus,
      startedAtMs: this.startedAtMs,
      endedAtMs: this.now(),
      failureCode: input.failureCode ?? null,
      stages: [...this.stages],
    };
  }

  private now(): number {
    return this.input.now?.() ?? Date.now();
  }
}
