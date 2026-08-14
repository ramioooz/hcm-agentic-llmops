import type { KnowledgeSource } from './knowledge';
import type { RagTraceStage } from './rag-trace-stage';

export type RagTrace = {
  traceId: string;
  correlationId: string;
  actorEmployeeCode: string;
  source: 'HTTP' | 'MCP';
  question: string;
  answer: string | null;
  documentId?: string;
  limit: number;
  embeddingModel: string;
  answerModel: string;
  retrievedChunks: Array<{
    documentId: string;
    chunkId: string;
    chunkIndex: number;
    pageNumber: number | null;
    score: number;
  }>;
  citations: KnowledgeSource[];
  resultStatus: 'ANSWERED' | 'INSUFFICIENT_EVIDENCE' | 'REJECTED' | 'FAILED';
  startedAtMs: number;
  endedAtMs: number;
  failureCode: string | null;
  stages: RagTraceStage[];
};
