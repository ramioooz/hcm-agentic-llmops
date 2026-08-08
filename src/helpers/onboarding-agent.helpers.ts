import type { InvocationBody } from '../types/invocation-body';
import type { OnboardingInvocationResult } from '../types/onboarding-invocation-result';
import type { OnboardingRequest } from '../types/onboarding-request';
import type { OnboardingReviewAction } from '../types/onboarding-review-action';

const supportedRequestPattern = /onboard|review period|initial review|probation/i;
const employeeCodePattern = /\bEMP-\d+\b/i;
const thresholdPattern = /(?:within|next|threshold(?: of)?)\s+(\d+)\s+days?/i;
const notificationPattern = /\bnotify\b|\bnotification\b|\bsend .*manager\b|\btell .*manager\b/i;

function isSupportedOnboardingRequest(query: string): boolean {
  return supportedRequestPattern.test(query);
}

function extractEmployeeCode(query: string): string | null {
  return query.match(employeeCodePattern)?.[0].toUpperCase() ?? null;
}

function extractThresholdDays(query: string): number {
  const thresholdMatch = query.match(thresholdPattern);
  return thresholdMatch ? Number(thresholdMatch[1]) : 30;
}

function resolveRequestedAction(query: string): OnboardingReviewAction {
  return notificationPattern.test(query) ? 'NOTIFY_MANAGER' : 'REVIEW_ONLY';
}

export function parseOnboardingRequest(query: string): OnboardingRequest {
  return {
    employeeCode: extractEmployeeCode(query),
    thresholdDays: extractThresholdDays(query),
    requestedAction: resolveRequestedAction(query),
    supported: isSupportedOnboardingRequest(query),
  };
}

export function todayAsDateOnly(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function buildInvocationResult(
  httpStatus: number,
  body: InvocationBody,
): OnboardingInvocationResult {
  return { httpStatus, body };
}
