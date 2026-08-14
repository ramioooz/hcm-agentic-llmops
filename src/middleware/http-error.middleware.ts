import type { ErrorRequestHandler } from 'express';

type HttpEntityError = {
  status?: unknown;
  type?: unknown;
};

export const handleHttpError: ErrorRequestHandler = (error, _request, response, next) => {
  void next;
  const entityError = error as HttpEntityError;

  if (entityError.type === 'entity.parse.failed' || entityError.status === 400) {
    response.status(400).json({
      status: 'FAILED',
      code: 'VALIDATION_ERROR',
      message: 'Request body must contain valid JSON.',
    });
    return;
  }

  if (entityError.type === 'entity.too.large' || entityError.status === 413) {
    response.status(413).json({
      status: 'FAILED',
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body exceeds the 16 KB limit.',
    });
    return;
  }

  response.status(500).json({
    status: 'FAILED',
    code: 'INTERNAL_ERROR',
    message: 'The request could not be completed.',
  });
};
