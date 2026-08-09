import { DevelopmentEventController } from '../controllers/development-event.controller';
import { WebhookTriggerController } from '../controllers/webhook-trigger.controller';
import type { HttpController } from '../controllers/http-controller';
import type { OnboardingEventPublisher } from '../types/onboarding-event-publisher';
import type { OnboardingTriggerHandler } from '../types/onboarding-trigger-handler';

export function createTriggerControllers(input: {
  nodeEnv: 'development' | 'test' | 'production';
  processor: OnboardingTriggerHandler;
  webhookApiKey: string;
  publisher: OnboardingEventPublisher;
}): HttpController[] {
  const controllers: HttpController[] = [
    new WebhookTriggerController({
      processor: input.processor,
      webhookApiKey: input.webhookApiKey,
    }),
  ];
  if (input.nodeEnv === 'development') {
    controllers.push(new DevelopmentEventController(input.publisher));
  }
  return controllers;
}
