import { z } from 'zod';

const environmentSchema = z.object({
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
});

type Environment = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  amqpUrl: string;
  openAiApiKey: string;
  openAiModel: 'gpt-5.4-mini';
  webhookApiKey: string;
  schedulerEnabled: boolean;
  automationActorEmployeeCode: string;
  rabbitPrefetch: number;
  rabbitMaxAttempts: number;
};

export function parseEnvironment(input: Record<string, string | undefined>): Environment {
  const parsed = environmentSchema.safeParse(input);

  if (!parsed.success) {
    const portIssue = parsed.error.issues.find((issue) => issue.path[0] === 'PORT');
    if (portIssue) {
      throw new Error('PORT must be a valid port number');
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
    webhookApiKey: parsed.data.WEBHOOK_API_KEY,
    schedulerEnabled: parsed.data.SCHEDULER_ENABLED,
    automationActorEmployeeCode: parsed.data.AUTOMATION_ACTOR_EMPLOYEE_CODE,
    rabbitPrefetch: parsed.data.RABBITMQ_PREFETCH,
    rabbitMaxAttempts: parsed.data.RABBITMQ_MAX_ATTEMPTS,
  };
}
