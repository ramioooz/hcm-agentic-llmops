import type { RagTrace } from './rag-trace';

export interface RagTraceRecorder {
  record(trace: RagTrace): Promise<void>;
}
