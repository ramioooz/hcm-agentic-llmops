import {
  AgentErrorCode,
  CommonErrorCode,
  KnowledgeErrorCode,
  LeaveErrorCode,
  TriggerErrorCode,
} from '../enums/error.enum';
import { ApplicationError } from '../errors/application.error';
import type { ApplicationErrorCode } from '../types/application-error-code';

const applicationErrorCodes = new Set<string>([
  ...Object.values(CommonErrorCode),
  ...Object.values(AgentErrorCode),
  ...Object.values(KnowledgeErrorCode),
  ...Object.values(LeaveErrorCode),
  ...Object.values(TriggerErrorCode),
]);

function isApplicationErrorCode(value: string): value is ApplicationErrorCode {
  return applicationErrorCodes.has(value);
}

export function resolveApplicationErrorCode<TFallback extends ApplicationErrorCode>(
  error: unknown,
  fallbackCode: TFallback,
): ApplicationErrorCode | TFallback {
  if (error instanceof ApplicationError) return error.code;
  if (error instanceof Error && isApplicationErrorCode(error.message)) return error.message;
  return fallbackCode;
}
