import type { RequestSafetyReasonCode } from './request-safety-reason-code';

export type RequestSafetyEvaluation =
  { isSafe: true } | { isSafe: false; reasonCode: RequestSafetyReasonCode };
