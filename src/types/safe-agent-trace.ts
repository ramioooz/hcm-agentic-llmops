export type SafeAgentTrace = {
  runId: string;
  correlationId: string;
  promptVersion: string;
  configuredModel: string;
  normalizedIntent: 'ONBOARDING_REVIEW' | 'LEAVE_REQUEST' | 'UNSUPPORTED' | null;
  nodePath: string[];
  toolNames: string[];
  authorizationResult: 'AUTHORIZED' | 'DENIED' | 'NOT_EVALUATED';
  retryCount: number;
  modelCallCount: number;
  tokenUsage: { input: number; output: number; total: number } | null;
  latencyMs: number;
  costUsd: number | null;
  failureCode: string | null;
};
