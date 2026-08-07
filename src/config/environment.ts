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
});

export type Environment = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  amqpUrl: string;
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
  };
}
