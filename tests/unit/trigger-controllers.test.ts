import type { Request, Response } from 'express';
import { DevelopmentEventController } from '../../src/controllers/development-event.controller';
import {
  isWebhookAuthorized,
  WebhookTriggerController,
} from '../../src/controllers/webhook-trigger.controller';
import { createTriggerControllers } from '../../src/triggers/create-trigger-controllers';
import type { OnboardingEventPublisher } from '../../src/types/onboarding-event-publisher';

const webhookApiKey = 'correct-webhook-key-at-least-32-characters';
const validEvent = {
  version: '1',
  eventId: 'event-onboarding-001',
  type: 'onboarding.review.requested',
  occurredAt: '2026-08-09T05:00:00.000Z',
  correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
  data: {
    employeeCode: 'EMP-201',
    thresholdDays: 30,
    action: 'REVIEW_ONLY',
  },
};

function requestWith(body: unknown, authorization?: string): Request {
  return {
    body,
    header: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined),
  } as Request;
}

function captureResponse() {
  const captured: { statusCode?: number; body?: unknown } = {};
  const response = {
    status: (statusCode: number) => {
      captured.statusCode = statusCode;
      return response;
    },
    json: (body: unknown) => {
      captured.body = body;
      return response;
    },
  } as Response;
  return { captured, response };
}

function fakeProcessor() {
  return {
    process: jest.fn().mockResolvedValue({ status: 'COMPLETED', runId: 'run-webhook-001' }),
  };
}

function fakePublisher() {
  const publish = jest.fn<
    ReturnType<OnboardingEventPublisher['publish']>,
    Parameters<OnboardingEventPublisher['publish']>
  >(async () => undefined);
  return { publisher: { publish } satisfies OnboardingEventPublisher, publish };
}

describe('WebhookTriggerController', () => {
  it('compares bearer credentials without length-dependent comparison errors', () => {
    expect(isWebhookAuthorized(`Bearer ${webhookApiKey}`, webhookApiKey)).toBe(true);
    expect(isWebhookAuthorized('Bearer short', webhookApiKey)).toBe(false);
    expect(isWebhookAuthorized(undefined, webhookApiKey)).toBe(false);
    expect(isWebhookAuthorized(`Basic ${webhookApiKey}`, webhookApiKey)).toBe(false);
  });

  it('rejects an invalid key before parsing or processing the raw body', async () => {
    const processor = fakeProcessor();
    const controller = new WebhookTriggerController({ processor, webhookApiKey });
    const output = captureResponse();

    await controller.handleWebhook(
      requestWith({ private: 'raw payload must not be retained' }, 'Bearer wrong-key'),
      output.response,
    );

    expect(output.captured).toEqual({
      statusCode: 401,
      body: {
        status: 'FAILED',
        code: 'WEBHOOK_UNAUTHORIZED',
        message: 'A valid bearer credential is required.',
      },
    });
    expect(processor.process).not.toHaveBeenCalled();
  });

  it('validates the event with the strict versioned Zod contract', async () => {
    const processor = fakeProcessor();
    const controller = new WebhookTriggerController({ processor, webhookApiKey });
    const output = captureResponse();

    await controller.handleWebhook(
      requestWith({ ...validEvent, version: '2' }, `Bearer ${webhookApiKey}`),
      output.response,
    );

    expect(output.captured).toEqual({
      statusCode: 400,
      body: {
        status: 'FAILED',
        code: 'WEBHOOK_VALIDATION_ERROR',
        message: 'The webhook event is invalid.',
      },
    });
    expect(processor.process).not.toHaveBeenCalled();
  });

  it('processes an authenticated event through the shared trigger processor', async () => {
    const processor = fakeProcessor();
    const controller = new WebhookTriggerController({ processor, webhookApiKey });
    const output = captureResponse();

    await controller.handleWebhook(
      requestWith(validEvent, `Bearer ${webhookApiKey}`),
      output.response,
    );

    expect(processor.process).toHaveBeenCalledWith({
      event: validEvent,
      triggerType: 'WEBHOOK',
      attempt: 1,
    });
    expect(output.captured).toEqual({
      statusCode: 200,
      body: { status: 'COMPLETED', runId: 'run-webhook-001' },
    });
  });
});

describe('DevelopmentEventController', () => {
  it('rejects an unsafe correlation value before publishing broker metadata', async () => {
    const broker = fakePublisher();
    const controller = new DevelopmentEventController(broker.publisher);
    const output = captureResponse();

    await controller.handlePublish(
      requestWith({ ...validEvent, correlationId: 'employee=EMP-201 secret=value' }),
      output.response,
    );

    expect(output.captured).toMatchObject({
      statusCode: 400,
      body: { status: 'FAILED', code: 'EVENT_VALIDATION_ERROR' },
    });
    expect(broker.publish).not.toHaveBeenCalled();
  });

  it('publishes the same typed event and returns accepted', async () => {
    const broker = fakePublisher();
    const controller = new DevelopmentEventController(broker.publisher);
    const output = captureResponse();

    await controller.handlePublish(requestWith(validEvent), output.response);

    expect(broker.publish).toHaveBeenCalledWith(validEvent, 1);
    expect(output.captured).toEqual({
      statusCode: 202,
      body: { status: 'ACCEPTED', eventId: 'event-onboarding-001' },
    });
  });

  it('is composed only for development', () => {
    const broker = fakePublisher();
    const processor = fakeProcessor();

    const development = createTriggerControllers({
      nodeEnv: 'development',
      processor,
      webhookApiKey,
      publisher: broker.publisher,
    });
    const production = createTriggerControllers({
      nodeEnv: 'production',
      processor,
      webhookApiKey,
      publisher: broker.publisher,
    });

    expect(development.some((controller) => controller instanceof DevelopmentEventController)).toBe(
      true,
    );
    expect(production.some((controller) => controller instanceof DevelopmentEventController)).toBe(
      false,
    );
  });
});
