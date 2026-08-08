import type { AgentRunStepRecord } from './agent-run-step-record';
import type { SecurityEventRecord } from './security-event-record';

export type AgentInvocationRecord = {
  runId: string;
  correlationId: string;
  triggerType: string;
  actorEmployeeCode?: string;
  intent?: string;
  requestSummary?: Record<string, unknown>;
  status: 'SUCCEEDED' | 'REJECTED' | 'FAILED';
  resultSummary?: Record<string, unknown>;
  steps: AgentRunStepRecord[];
  securityEvents: SecurityEventRecord[];
};
