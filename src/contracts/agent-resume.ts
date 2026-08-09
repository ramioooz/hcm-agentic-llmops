import { z } from 'zod';

const agentResumeSchema = z
  .object({
    threadId: z.string().uuid(),
    decision: z.enum(['APPROVE', 'REJECT']),
  })
  .strict();

export function parseAgentResumeRequest(value: unknown) {
  return agentResumeSchema.parse(value);
}
