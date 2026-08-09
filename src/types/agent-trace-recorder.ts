import type { SafeAgentTrace } from './safe-agent-trace';

export interface AgentTraceRecorder {
  record(trace: SafeAgentTrace): Promise<void>;
}
