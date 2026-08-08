import type { ApplicationLogger } from '../types/application-logger';
import type { InvocationBody } from '../types/invocation-body';

export function logAgentInvocationResult(
  logger: ApplicationLogger,
  httpStatus: number,
  body: InvocationBody,
  correlationId: string,
): void {
  const entry = {
    correlationId,
    runId: body.runId,
    status: body.status,
    ...(typeof body.code === 'string' ? { code: body.code } : {}),
    httpStatus,
  };

  if (httpStatus >= 500) {
    logger.error({ event: 'agent.invoke.failed', ...entry });
    return;
  }

  if (httpStatus >= 400) {
    logger.warn({ event: 'agent.invoke.rejected', ...entry });
    return;
  }

  logger.info({ event: 'agent.invoke.completed', ...entry });
}
