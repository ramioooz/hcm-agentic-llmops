import type { InvocationBody } from '../types/invocation-body';
import type { OnboardingInvocationResult } from '../types/onboarding-invocation-result';
export function todayAsDateOnly(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function buildInvocationResult(
  httpStatus: number,
  body: InvocationBody,
): OnboardingInvocationResult {
  return { httpStatus, body };
}
