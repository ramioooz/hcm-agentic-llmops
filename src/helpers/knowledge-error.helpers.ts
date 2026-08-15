const STABLE_ERROR_CODE = /^[A-Z0-9_]+$/;

export function knowledgeErrorCode(error: unknown, fallbackCode: string): string {
  return error instanceof Error && STABLE_ERROR_CODE.test(error.message)
    ? error.message
    : fallbackCode;
}

export function knowledgeError(error: unknown, fallbackCode: string): Error {
  return new Error(knowledgeErrorCode(error, fallbackCode));
}
