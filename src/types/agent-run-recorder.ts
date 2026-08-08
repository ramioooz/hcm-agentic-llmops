import type { AgentInvocationRecord } from './agent-invocation-record';

export type AgentRunRecorder = {
  recordInvocation(record: AgentInvocationRecord): Promise<void>;
};
