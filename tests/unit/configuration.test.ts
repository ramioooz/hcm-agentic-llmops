import { parseEnvironment } from '../../src/config/environment';

describe('parseEnvironment', () => {
  it('returns validated settings for a complete environment', () => {
    expect(
      parseEnvironment({
        NODE_ENV: 'test',
        PORT: '3010',
        DATABASE_URL: 'postgresql://app:secret@localhost:5432/hcm',
        AMQP_URL: 'amqp://localhost:5672',
      }),
    ).toEqual({
      nodeEnv: 'test',
      port: 3010,
      databaseUrl: 'postgresql://app:secret@localhost:5432/hcm',
      amqpUrl: 'amqp://localhost:5672',
    });
  });

  it('rejects an invalid port instead of silently using a default', () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: 'test',
        PORT: 'not-a-port',
        DATABASE_URL: 'postgresql://app:secret@localhost:5432/hcm',
        AMQP_URL: 'amqp://localhost:5672',
      }),
    ).toThrow('PORT must be a valid port number');
  });

  it.each(['0', '65536'])('rejects out-of-range port %s', (port) => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: 'test',
        PORT: port,
        DATABASE_URL: 'postgresql://app:secret@localhost:5432/hcm',
        AMQP_URL: 'amqp://localhost:5672',
      }),
    ).toThrow('PORT must be a valid port number');
  });
});
