type StructuredFailure = {
  status: 'FAILED';
  code: 'AUTHORIZATION_DENIED' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR';
  message: string;
};

export function mapWorkflowFailure(error: unknown): StructuredFailure {
  const message = error instanceof Error ? error.message : 'Unexpected workflow failure';

  if (message === 'AUTHORIZATION_DENIED') {
    return {
      status: 'FAILED',
      code: 'AUTHORIZATION_DENIED',
      message: 'You are not authorized to perform this operation.',
    };
  }

  if (message.includes('must be') || message.includes('required')) {
    return { status: 'FAILED', code: 'VALIDATION_ERROR', message };
  }

  return {
    status: 'FAILED',
    code: 'INTERNAL_ERROR',
    message: 'The workflow could not be completed.',
  };
}
