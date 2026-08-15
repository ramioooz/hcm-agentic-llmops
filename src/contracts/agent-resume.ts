import { z } from 'zod';
import { LeaveApprovalDecision } from '../enums/leave.enum';

const agentResumeSchema = z
  .object({
    threadId: z.string().uuid(),
    decision: z.enum(LeaveApprovalDecision),
  })
  .strict();

export function parseAgentResumeRequest(value: unknown) {
  return agentResumeSchema.parse(value);
}
