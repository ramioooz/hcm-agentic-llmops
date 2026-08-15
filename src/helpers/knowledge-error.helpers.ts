import type { ApplicationErrorCode } from '../types/application-error-code';
import { ApplicationError } from '../errors/application.error';
import { resolveApplicationErrorCode } from './application-error.helpers';

export function knowledgeErrorCode(
  error: unknown,
  fallbackCode: ApplicationErrorCode,
): ApplicationErrorCode {
  return resolveApplicationErrorCode(error, fallbackCode);
}

export function knowledgeError(
  error: unknown,
  fallbackCode: ApplicationErrorCode,
): ApplicationError {
  return new ApplicationError(knowledgeErrorCode(error, fallbackCode), { cause: error });
}
