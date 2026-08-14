export type RagTraceStage = {
  id: string;
  name:
    | 'rag.query_guard'
    | 'rag.query_embedding'
    | 'rag.vector_retrieval'
    | 'rag.evidence_guard'
    | 'rag.grounded_answer'
    | 'rag.output_validation';
  startedAtMs: number;
  endedAtMs: number;
  status: 'COMPLETED' | 'REJECTED' | 'FAILED';
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  failureCode?: string;
};
