import type { InvocationBody } from './invocation-body';

export type OnboardingInvocationResult = {
  httpStatus: number;
  body: InvocationBody;
};
