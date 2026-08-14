import { z } from 'zod';
import { assertAutomaticTracingDisabled } from '../observability/automatic-tracing-guard';

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z
      .string()
      .regex(/^\d+$/, 'PORT must be a valid port number')
      .transform(Number)
      .refine((port) => port >= 1 && port <= 65_535, 'PORT must be a valid port number'),
    DATABASE_URL: z.string().url(),
    AMQP_URL: z.string().url(),
    OPENAI_API_KEY: z.string().min(1),
    OPENAI_MODEL: z.literal('gpt-5.4-mini').default('gpt-5.4-mini'),
    OPENAI_EMBEDDING_MODEL: z.string().min(1).default('text-embedding-3-small'),
    RAG_EXTERNAL_PROCESSING_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    WEBHOOK_API_KEY: z.string().min(32),
    SCHEDULER_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    AUTOMATION_ACTOR_EMPLOYEE_CODE: z
      .string()
      .regex(/^EMP-\d+$/)
      .default('EMP-100'),
    RABBITMQ_PREFETCH: z
      .string()
      .regex(/^\d+$/)
      .default('10')
      .transform(Number)
      .refine((value) => value >= 1 && value <= 100),
    RABBITMQ_MAX_ATTEMPTS: z
      .string()
      .regex(/^\d+$/)
      .default('3')
      .transform(Number)
      .refine((value) => value >= 1 && value <= 10),
    LANGSMITH_AGENT_TRACING: z.enum(['true', 'false']).default('false'),
    LANGSMITH_RAG_TRACING: z.enum(['true', 'false']).default('false'),
    LANGSMITH_API_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    LANGSMITH_PROJECT: z.string().min(1).default('hcm-agentic-llmops'),
  })
  .superRefine((environment, context) => {
    if (
      (environment.LANGSMITH_AGENT_TRACING === 'true' ||
        environment.LANGSMITH_RAG_TRACING === 'true') &&
      !environment.LANGSMITH_API_KEY
    ) {
      context.addIssue({
        code: 'custom',
        path: ['LANGSMITH_API_KEY'],
        message: 'required when LANGSMITH_AGENT_TRACING=true',
      });
    }
  });

type Environment = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  amqpUrl: string;
  openAiApiKey: string;
  openAiModel: 'gpt-5.4-mini';
  openAiEmbeddingModel: string;
  ragExternalProcessingEnabled: boolean;
  webhookApiKey: string;
  schedulerEnabled: boolean;
  automationActorEmployeeCode: string;
  rabbitPrefetch: number;
  rabbitMaxAttempts: number;
  langSmithTracing: boolean;
  langSmithRagTracing: boolean;
  langSmithApiKey?: string;
  langSmithProject: string;
};

export function parseEnvironment(input: Record<string, string | undefined>): Environment {
  assertAutomaticTracingDisabled(input);

  const parsed = environmentSchema.safeParse(input);

  if (!parsed.success) {
    const portIssue = parsed.error.issues.find((issue) => issue.path[0] === 'PORT');
    if (portIssue) {
      throw new Error('PORT must be a valid port number');
    }

    const langSmithKeyIssue = parsed.error.issues.find(
      (issue) => issue.path[0] === 'LANGSMITH_API_KEY',
    );
    if (langSmithKeyIssue) {
      if (input.LANGSMITH_AGENT_TRACING === 'true') {
        throw new Error('LANGSMITH_API_KEY is required when LANGSMITH_AGENT_TRACING=true');
      }
      if (input.LANGSMITH_RAG_TRACING === 'true') {
        throw new Error('LANGSMITH_API_KEY is required when LANGSMITH_RAG_TRACING=true');
      }
    }

    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  }

  return {
    nodeEnv: parsed.data.NODE_ENV,
    port: parsed.data.PORT,
    databaseUrl: parsed.data.DATABASE_URL,
    amqpUrl: parsed.data.AMQP_URL,
    openAiApiKey: parsed.data.OPENAI_API_KEY,
    openAiModel: parsed.data.OPENAI_MODEL,
    openAiEmbeddingModel: parsed.data.OPENAI_EMBEDDING_MODEL,
    ragExternalProcessingEnabled: parsed.data.RAG_EXTERNAL_PROCESSING_ENABLED,
    webhookApiKey: parsed.data.WEBHOOK_API_KEY,
    schedulerEnabled: parsed.data.SCHEDULER_ENABLED,
    automationActorEmployeeCode: parsed.data.AUTOMATION_ACTOR_EMPLOYEE_CODE,
    rabbitPrefetch: parsed.data.RABBITMQ_PREFETCH,
    rabbitMaxAttempts: parsed.data.RABBITMQ_MAX_ATTEMPTS,
    langSmithTracing: parsed.data.LANGSMITH_AGENT_TRACING === 'true',
    langSmithRagTracing: parsed.data.LANGSMITH_RAG_TRACING === 'true',
    langSmithApiKey: parsed.data.LANGSMITH_API_KEY,
    langSmithProject: parsed.data.LANGSMITH_PROJECT,
  };
}
