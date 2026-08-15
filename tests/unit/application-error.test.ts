import { ApplicationError } from '../../src/errors/application.error';
import { CommonErrorCode, KnowledgeErrorCode } from '../../src/enums/error.enum';
import { resolveApplicationErrorCode } from '../../src/helpers/application-error.helpers';

test('normalizes only recognized application error codes', () => {
  expect(
    resolveApplicationErrorCode(
      new ApplicationError(KnowledgeErrorCode.DatabaseWriteFailed),
      CommonErrorCode.InternalError,
    ),
  ).toBe(KnowledgeErrorCode.DatabaseWriteFailed);

  expect(
    resolveApplicationErrorCode(
      new Error(CommonErrorCode.AuthorizationDenied),
      CommonErrorCode.InternalError,
    ),
  ).toBe(CommonErrorCode.AuthorizationDenied);

  expect(
    resolveApplicationErrorCode(
      new Error('UNRECOGNIZED_UPPERCASE_ERROR'),
      CommonErrorCode.InternalError,
    ),
  ).toBe(CommonErrorCode.InternalError);
});
