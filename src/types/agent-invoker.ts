import type { OnboardingInvocationInput } from './onboarding-invocation-input';
import type { OnboardingInvocationResult } from './onboarding-invocation-result';
import type { AgentProgressEvent } from './agent-progress-event';

export interface AgentInvoker {
  invoke(input: OnboardingInvocationInput): Promise<OnboardingInvocationResult>;
  stream(input: OnboardingInvocationInput): AsyncIterable<AgentProgressEvent>;
}
