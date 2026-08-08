import { z } from 'zod';

const agentInvokeRequestSchema = z.object({
  query: z.string().trim().min(1, 'query must be a non-empty string').max(2_000),
});

type AgentInvokeRequest = z.infer<typeof agentInvokeRequestSchema>;

export function parseAgentInvokeRequest(input: unknown): AgentInvokeRequest {
  const parsed = agentInvokeRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid agent invocation request');
  }

  return parsed.data;
}
