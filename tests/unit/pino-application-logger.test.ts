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
        error: { message: 'database connection for Samira failed', stack: 'stack trace' },
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
        error: { message: '[REDACTED]', stack: '[REDACTED]' },
      },
    });
    expect(JSON.stringify(entry)).not.toContain('Samira');
    expect(JSON.stringify(entry)).not.toContain('EMP-1001');
  });
});
