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
        WEBHOOK_API_KEY: 'unit-test-webhook-key-at-least-32-characters',
      }),
    ).toEqual({
      nodeEnv: 'test',
      port: 3010,
      databaseUrl: 'postgresql://app:secret@localhost:5432/hcm',
      amqpUrl: 'amqp://localhost:5672',
      openAiApiKey: 'unit-test-key',
      openAiModel: 'gpt-5.4-mini',
      openAiEmbeddingModel: 'text-embedding-3-small',
      ragExternalProcessingEnabled: false,
      webhookApiKey: 'unit-test-webhook-key-at-least-32-characters',
      schedulerEnabled: false,
      automationActorEmployeeCode: 'EMP-100',
      rabbitPrefetch: 10,
      rabbitMaxAttempts: 3,
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
        WEBHOOK_API_KEY: 'unit-test-webhook-key-at-least-32-characters',
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
        WEBHOOK_API_KEY: 'unit-test-webhook-key-at-least-32-characters',
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
        WEBHOOK_API_KEY: 'unit-test-webhook-key-at-least-32-characters',
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
        WEBHOOK_API_KEY: 'unit-test-webhook-key-at-least-32-characters',
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
        WEBHOOK_API_KEY: 'unit-test-webhook-key-at-least-32-characters',
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
        WEBHOOK_API_KEY: 'unit-test-webhook-key-at-least-32-characters',
        [alias]: 'true',
      }),
    ).toThrow('Automatic LangChain tracing must remain disabled');
  });

  it('parses enabled automation and bounded RabbitMQ settings', () => {
    const environment = parseEnvironment({
      NODE_ENV: 'production',
      PORT: '3010',
      DATABASE_URL: 'postgresql://app:secret@localhost:5432/hcm',
      AMQP_URL: 'amqp://localhost:5672',
      OPENAI_API_KEY: 'unit-test-key',
      WEBHOOK_API_KEY: 'unit-test-webhook-key-at-least-32-characters',
      SCHEDULER_ENABLED: 'true',
      AUTOMATION_ACTOR_EMPLOYEE_CODE: 'EMP-900',
      RABBITMQ_PREFETCH: '7',
      RABBITMQ_MAX_ATTEMPTS: '4',
    });

    expect(environment).toMatchObject({
      schedulerEnabled: true,
      automationActorEmployeeCode: 'EMP-900',
      rabbitPrefetch: 7,
      rabbitMaxAttempts: 4,
    });
  });

  it('rejects a short webhook secret', () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: 'test',
        PORT: '3010',
        DATABASE_URL: 'postgresql://app:secret@localhost:5432/hcm',
        AMQP_URL: 'amqp://localhost:5672',
        OPENAI_API_KEY: 'unit-test-key',
        WEBHOOK_API_KEY: 'too-short',
      }),
    ).toThrow('Invalid environment: WEBHOOK_API_KEY');
  });
});
