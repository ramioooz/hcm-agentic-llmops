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

export function resolveApplicationErrorCode(
  error: unknown,
  fallbackCode: ApplicationErrorCode,
): ApplicationErrorCode {
  if (error instanceof ApplicationError) return error.code;
  if (error instanceof Error && isApplicationErrorCode(error.message)) return error.message;
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && isApplicationErrorCode(code)) return code;
  }
  return fallbackCode;
}
