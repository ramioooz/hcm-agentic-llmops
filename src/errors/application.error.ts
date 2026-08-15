import type { ApplicationErrorCode } from '../types/application-error-code';

export class ApplicationError<
  TCode extends ApplicationErrorCode = ApplicationErrorCode,
> extends Error {
  public constructor(
    public readonly code: TCode,
    options?: { cause?: unknown },
  ) {
    super(code, options);
    this.name = 'ApplicationError';
  }
}
