import { logAgentInvocationResult } from '../../src/observability/agent-invocation-logging';
import type { ApplicationLogger } from '../../src/types/application-logger';
import type { OperationalLogEntry } from '../../src/types/operational-log-entry';

function captureLogger(): {
  error: jest.Mock<void, [OperationalLogEntry]>;
  info: jest.Mock<void, [OperationalLogEntry]>;
  logger: ApplicationLogger;
  warn: jest.Mock<void, [OperationalLogEntry]>;
} {
  const info = jest.fn<void, [OperationalLogEntry]>();
  const warn = jest.fn<void, [OperationalLogEntry]>();
  const error = jest.fn<void, [OperationalLogEntry]>();

  return { error, info, logger: { error, info, warn }, warn };
}

describe('logAgentInvocationResult', () => {
  it('logs a successful result at info level', () => {
    const logs = captureLogger();

    logAgentInvocationResult(
      logs.logger,
      200,
      {
        status: 'COMPLETED',
        message: 'Employee onboarding review completed.',
        runId: 'run-200',
        correlationId: 'corr-200',
      },
      'corr-200',
    );

    expect(logs.info).toHaveBeenCalledWith({
      event: 'agent.invoke.completed',
      correlationId: 'corr-200',
      runId: 'run-200',
      status: 'COMPLETED',
      httpStatus: 200,
    });
  });

  it('logs a handled client failure at warn level', () => {
    const logs = captureLogger();

    logAgentInvocationResult(
      logs.logger,
      403,
      {
        status: 'FAILED',
        code: 'AUTHORIZATION_DENIED',
        message: 'You are not authorized to perform this operation.',
        runId: 'run-403',
        correlationId: 'corr-403',
      },
      'corr-403',
    );

    expect(logs.warn).toHaveBeenCalledWith({
      event: 'agent.invoke.rejected',
      correlationId: 'corr-403',
      runId: 'run-403',
      status: 'FAILED',
      code: 'AUTHORIZATION_DENIED',
      httpStatus: 403,
    });
  });

  it('logs a handled server failure at error level', () => {
    const logs = captureLogger();

    logAgentInvocationResult(
      logs.logger,
      500,
      {
        status: 'FAILED',
        code: 'INTERNAL_ERROR',
        message: 'The workflow could not be completed.',
        runId: 'run-500',
        correlationId: 'corr-500',
      },
      'corr-500',
    );

    expect(logs.error).toHaveBeenCalledWith({
      event: 'agent.invoke.failed',
      correlationId: 'corr-500',
      runId: 'run-500',
      status: 'FAILED',
      code: 'INTERNAL_ERROR',
      httpStatus: 500,
    });
  });
});
