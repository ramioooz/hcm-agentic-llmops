import type { RequestSafetyReasonCode } from './request-safety-reason-code';

export type AgentTrace = {
  runId: string;
  threadId: string;
  correlationId: string;
  rawQuery: string;
  promptVersion: string;
  configuredModel: string;
  normalizedIntent: 'ONBOARDING_REVIEW' | 'LEAVE_REQUEST' | 'UNSUPPORTED' | null;
  nodePath: string[];
  toolNames: string[];
  authorizationResult: 'AUTHORIZED' | 'DENIED' | 'NOT_EVALUATED';
  guardrailReasonCode: RequestSafetyReasonCode | null;
  blockedBeforeModel: boolean;
  retryCount: number;
  modelCallCount: number;
  tokenUsage: { input: number; output: number; total: number } | null;
  latencyMs: number;
  costUsd: number | null;
  failureCode: string | null;
};
