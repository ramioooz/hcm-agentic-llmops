import { createHash, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { onboardingTriggerEventSchema } from '../contracts/onboarding-trigger-event';
import { TriggerErrorCode } from '../enums/error.enum';
import { TriggerProcessingError } from '../services/onboarding-trigger-processor';
import type { OnboardingTriggerHandler } from '../types/onboarding-trigger-handler';
import type { HttpController } from './http-controller';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function isWebhookAuthorized(
  authorizationHeader: string | undefined,
  expectedApiKey: string,
): boolean {
  const candidate = authorizationHeader?.startsWith('Bearer ')
    ? authorizationHeader.slice('Bearer '.length)
    : '';
  return timingSafeEqual(digest(candidate), digest(expectedApiKey));
}

export class WebhookTriggerController implements HttpController {
  public readonly basePath = '/api/v1/triggers';
  public readonly router = Router();

  public constructor(
    private readonly dependencies: {
      processor: OnboardingTriggerHandler;
      webhookApiKey: string;
    },
  ) {
    this.router.post('/webhook', this.handleWebhook);
  }

  public readonly handleWebhook = async (request: Request, response: Response): Promise<void> => {
    if (!isWebhookAuthorized(request.header('Authorization'), this.dependencies.webhookApiKey)) {
      response.status(401).json({
        status: 'FAILED',
        code: 'WEBHOOK_UNAUTHORIZED',
        message: 'A valid bearer credential is required.',
      });
      return;
    }

    const parsed = onboardingTriggerEventSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        status: 'FAILED',
        code: 'WEBHOOK_VALIDATION_ERROR',
        message: 'The webhook event is invalid.',
      });
      return;
    }

    try {
      const outcome = await this.dependencies.processor.process({
        event: parsed.data,
        triggerType: 'WEBHOOK',
        attempt: 1,
      });
      response.status(200).json(outcome);
    } catch (error) {
      const conflict =
        error instanceof TriggerProcessingError && error.code === TriggerErrorCode.EventIdConflict;
      response.status(conflict ? 409 : 500).json({
        status: 'FAILED',
        code: conflict ? TriggerErrorCode.EventIdConflict : 'TRIGGER_PROCESSING_FAILED',
        message: conflict
          ? 'The event identifier is already associated with different content.'
          : 'The trigger could not be processed.',
      });
    }
  };
}
