import { formatStartupError } from '../../src/helpers/startup-error.helpers';

describe('startup error diagnostics', () => {
  it('formats startup failures as actionable diagnostics without exposing secrets', () => {
    const portConflict = Object.assign(
      new Error('listen EADDRINUSE: address already in use :::3300'),
      {
        code: 'EADDRINUSE',
        port: 3300,
      },
    );

    expect(formatStartupError(portConflict, { includeStack: false })).toBe(
      'API failed to start [EADDRINUSE]: port 3300 is already in use.\n' +
        'Fix: stop the existing process or configure a different PORT.',
    );

    const unexpected = Object.assign(
      new Error(
        'Bootstrap failed for postgresql://hcm:database-secret@localhost:55432/hcm with Authorization: Bearer bearer-secret and OPENAI_API_KEY=api-key-value',
      ),
      { code: 'EBOOT' },
    );

    const diagnostic = formatStartupError(unexpected, { includeStack: true });

    expect(diagnostic).toContain('API failed to start [EBOOT]: Bootstrap failed');
    expect(diagnostic).toContain('postgresql://hcm:[REDACTED]@localhost:55432/hcm');
    expect(diagnostic).toContain('Authorization: Bearer [REDACTED]');
    expect(diagnostic).toContain('OPENAI_API_KEY=[REDACTED]');
    expect(diagnostic).not.toContain('database-secret');
    expect(diagnostic).not.toContain('bearer-secret');
    expect(diagnostic).not.toContain('api-key-value');
  });
});
