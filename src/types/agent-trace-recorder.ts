import type { AgentTrace } from './agent-trace';

export interface AgentTraceRecorder {
  record(trace: AgentTrace): Promise<void>;
}
