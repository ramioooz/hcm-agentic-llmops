import type { OnboardingTriggerEvent } from '../contracts/onboarding-trigger-event';
import type { TechnicalTriggerType } from '../services/onboarding-trigger-processor';

export type OnboardingTriggerHandler = {
  process(input: {
    event: OnboardingTriggerEvent;
    triggerType: TechnicalTriggerType;
    attempt: number;
    correlationId?: string;
  }): Promise<{ status: 'COMPLETED'; runId: string } | { status: 'DUPLICATE' }>;
};
