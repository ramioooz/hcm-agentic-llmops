import pino from 'pino';
import { PinoApplicationLogger } from '../../src/observability/pino-application-logger';

describe('PinoApplicationLogger', () => {
  test('writes a recursively redacted JSON log entry', () => {
    const writes: string[] = [];
    const destination = {
      write: (line: string) => {
        writes.push(line);
        return true;
      },
    };
    const logger = new PinoApplicationLogger(pino({}, destination));

    logger.info({
      event: 'agent.invoke.started',
      correlationId: 'corr-log-001',
      query: 'Review employee EMP-1001',
      details: {
        employeeCode: 'EMP-1001',
        employeeId: 'EMP-1001',
        contact: { email: 'samira.noor@example.test' },
        errorMessage: 'database connection for Samira failed',
        error: { message: 'database connection for Samira failed', stack: 'stack trace' },
        cause: 'underlying service failure',
        nested: {
          error: 'nested error detail',
          cause: { errorMessage: 'nested cause detail' },
        },
      },
    });

    const entry = JSON.parse(writes[0] ?? '') as Record<string, unknown>;

    expect(entry).toMatchObject({
      event: 'agent.invoke.started',
      correlationId: 'corr-log-001',
      query: '[REDACTED]',
      details: {
        employeeCode: '[REDACTED]',
        employeeId: '[REDACTED]',
        contact: { email: '[REDACTED]' },
        errorMessage: '[REDACTED]',
        error: '[REDACTED]',
        cause: '[REDACTED]',
        nested: {
          error: '[REDACTED]',
          cause: '[REDACTED]',
        },
      },
    });
    expect(JSON.stringify(entry)).not.toContain('Samira');
    expect(JSON.stringify(entry)).not.toContain('EMP-1001');
    expect(JSON.stringify(entry)).not.toContain('database connection for Samira failed');
    expect(JSON.stringify(entry)).not.toContain('underlying service failure');
    expect(JSON.stringify(entry)).not.toContain('nested error detail');
    expect(JSON.stringify(entry)).not.toContain('nested cause detail');

    logger.warn({
      event: 'knowledge.trace.skipped',
      correlationId: 'corr-log-002',
      status: 'SKIPPED',
      code: 'LANGSMITH_API_KEY_MISSING',
      message:
        'The RAG query was not sent to LangSmith because LANGSMITH_API_KEY is not configured.',
    });

    expect(JSON.parse(writes[1] ?? '')).toMatchObject({
      event: 'knowledge.trace.skipped',
      correlationId: 'corr-log-002',
      status: 'SKIPPED',
      code: 'LANGSMITH_API_KEY_MISSING',
      message:
        'The RAG query was not sent to LangSmith because LANGSMITH_API_KEY is not configured.',
    });
  });
});
