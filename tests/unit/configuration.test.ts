import { parseEnvironment } from '../../src/config/environment';

describe('parseEnvironment', () => {
  it('returns validated settings for a complete environment', () => {
    expect(
      parseEnvironment({
        NODE_ENV: 'test',
        PORT: '3010',
        DATABASE_URL: 'postgresql://app:secret@localhost:5432/hcm',
        AMQP_URL: 'amqp://localhost:5672',
        OPENAI_API_KEY: 'unit-test-key',
      }),
    ).toEqual({
      nodeEnv: 'test',
      port: 3010,
      databaseUrl: 'postgresql://app:secret@localhost:5432/hcm',
      amqpUrl: 'amqp://localhost:5672',
      openAiApiKey: 'unit-test-key',
      openAiModel: 'gpt-5.4-mini',
      langSmithTracing: false,
      langSmithApiKey: undefined,
      langSmithProject: 'hcm-agentic-api',
    });
  });

  it('rejects an invalid port instead of silently using a default', () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: 'test',
        PORT: 'not-a-port',
        DATABASE_URL: 'postgresql://app:secret@localhost:5432/hcm',
        AMQP_URL: 'amqp://localhost:5672',
        OPENAI_API_KEY: 'unit-test-key',
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
        OPENAI_API_KEY: 'unit-test-key',
      }),
    ).toThrow('PORT must be a valid port number');
  });

  it('keeps LangSmith tracing disabled without requiring a key', () => {
    expect(
      parseEnvironment({
        NODE_ENV: 'test',
        PORT: '3010',
        DATABASE_URL: 'postgresql://app:secret@localhost:5432/hcm',
        AMQP_URL: 'amqp://localhost:5672',
        OPENAI_API_KEY: 'unit-test-key',
      }),
    ).toMatchObject({
      langSmithTracing: false,
      langSmithApiKey: undefined,
      langSmithProject: 'hcm-agentic-api',
    });
  });

  it('treats an empty optional LangSmith key as unconfigured when tracing is disabled', () => {
    expect(
      parseEnvironment({
        NODE_ENV: 'test',
        PORT: '3010',
        DATABASE_URL: 'postgresql://app:secret@localhost:5432/hcm',
        AMQP_URL: 'amqp://localhost:5672',
        OPENAI_API_KEY: 'unit-test-key',
        LANGSMITH_AGENT_TRACING: 'false',
        LANGSMITH_API_KEY: '',
      }).langSmithApiKey,
    ).toBeUndefined();
  });

  it('requires a LangSmith API key only when tracing is enabled', () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: 'test',
        PORT: '3010',
        DATABASE_URL: 'postgresql://app:secret@localhost:5432/hcm',
        AMQP_URL: 'amqp://localhost:5672',
        OPENAI_API_KEY: 'unit-test-key',
        LANGSMITH_AGENT_TRACING: 'true',
      }),
    ).toThrow('LANGSMITH_API_KEY is required when LANGSMITH_AGENT_TRACING=true');
  });

  it.each([
    'LANGSMITH_TRACING',
    'LANGSMITH_TRACING_V2',
    'LANGCHAIN_TRACING',
    'LANGCHAIN_TRACING_V2',
  ])('rejects automatic tracing alias %s to prevent duplicate unsafe traces', (alias) => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: 'test',
        PORT: '3010',
        DATABASE_URL: 'postgresql://app:secret@localhost:5432/hcm',
        AMQP_URL: 'amqp://localhost:5672',
        OPENAI_API_KEY: 'unit-test-key',
        [alias]: 'true',
      }),
    ).toThrow('Automatic LangChain tracing must remain disabled');
  });
});
