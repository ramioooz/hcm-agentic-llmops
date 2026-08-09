export type AgentResumeInput = {
  decision: 'APPROVE' | 'REJECT';
  actorEmployeeCode: string;
  correlationId: string;
  threadId: string;
  runId?: string;
};
