import type { NextFunction, Request, Response } from 'express';
import { handleHttpError } from '../../src/middleware/http-error.middleware';

describe('HTTP error middleware', () => {
  it.each([
    {
      error: Object.assign(new SyntaxError('Unexpected token'), {
        status: 400,
        type: 'entity.parse.failed',
      }),
      expectedStatus: 400,
      expectedBody: {
        status: 'FAILED',
        code: 'VALIDATION_ERROR',
        message: 'Request body must contain valid JSON.',
      },
    },
    {
      error: Object.assign(new Error('request entity too large'), {
        status: 413,
        type: 'entity.too.large',
      }),
      expectedStatus: 413,
      expectedBody: {
        status: 'FAILED',
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body exceeds the 16 KB limit.',
      },
    },
    {
      error: new Error('/private/path and stack must not leak'),
      expectedStatus: 500,
      expectedBody: {
        status: 'FAILED',
        code: 'INTERNAL_ERROR',
        message: 'The request could not be completed.',
      },
    },
  ])(
    'maps request failures to bounded JSON without internal details',
    ({ error, expectedStatus, expectedBody }) => {
      const json = jest.fn();
      const status = jest.fn(() => ({ json }));

      handleHttpError(
        error,
        {} as Request,
        { status } as unknown as Response,
        (() => undefined) as NextFunction,
      );

      expect(status).toHaveBeenCalledWith(expectedStatus);
      expect(json).toHaveBeenCalledWith(expectedBody);
      expect(JSON.stringify(json.mock.calls)).not.toContain('/private/path');
    },
  );
});
