import { Router, type Request, type Response } from 'express';
import { onboardingTriggerEventSchema } from '../contracts/onboarding-trigger-event';
import type { OnboardingEventPublisher } from '../types/onboarding-event-publisher';
import type { HttpController } from './http-controller';

export class DevelopmentEventController implements HttpController {
  public readonly basePath = '/api/v1/dev';
  public readonly router = Router();

  public constructor(private readonly publisher: OnboardingEventPublisher) {
    this.router.post('/events', this.handlePublish);
  }

  public readonly handlePublish = async (request: Request, response: Response): Promise<void> => {
    const parsed = onboardingTriggerEventSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        status: 'FAILED',
        code: 'EVENT_VALIDATION_ERROR',
        message: 'The event is invalid.',
      });
      return;
    }

    try {
      await this.publisher.publish(parsed.data, 1);
      response.status(202).json({ status: 'ACCEPTED', eventId: parsed.data.eventId });
    } catch {
      response.status(503).json({
        status: 'FAILED',
        code: 'EVENT_PUBLISH_FAILED',
        message: 'The event could not be published.',
      });
    }
  };
}
