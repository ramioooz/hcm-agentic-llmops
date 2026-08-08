import type { OnboardingInvocationInput } from './onboarding-invocation-input';
import type { OnboardingInvocationResult } from './onboarding-invocation-result';

export interface AgentInvoker {
  invoke(input: OnboardingInvocationInput): Promise<OnboardingInvocationResult>;
}
