import type { OnboardingInvocationInput } from './onboarding-invocation-input';
import type { OnboardingInvocationResult } from './onboarding-invocation-result';
import type { AgentProgressEvent } from './agent-progress-event';
import type { AgentResumeInput } from './agent-resume-input';

export interface AgentInvoker {
  invoke(input: OnboardingInvocationInput): Promise<OnboardingInvocationResult>;
  stream(input: OnboardingInvocationInput): AsyncIterable<AgentProgressEvent>;
  resume?(input: AgentResumeInput): Promise<OnboardingInvocationResult>;
}
