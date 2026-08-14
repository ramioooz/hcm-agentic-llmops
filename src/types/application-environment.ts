export type ApplicationEnvironment = {
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
