import type { LeaveApprovalDecision } from '../enums/leave.enum';

export type AgentResumeInput = {
  decision: LeaveApprovalDecision;
  actorEmployeeCode: string;
  correlationId: string;
  threadId: string;
  runId?: string;
};
