import type { OnboardingTriggerEvent } from '../contracts/onboarding-trigger-event';

export type OnboardingEventPublisher = {
  publish(event: OnboardingTriggerEvent, attempt: number): Promise<void>;
};
