import {
  onboardingTriggerEventSchema,
  type OnboardingTriggerEvent,
} from '../contracts/onboarding-trigger-event';
import { CommonErrorCode, TriggerErrorCode } from '../enums/error.enum';
import { ApplicationError } from '../errors/application.error';
import { resolveApplicationErrorCode } from '../helpers/application-error.helpers';
import { resolveSafeCorrelationId } from '../security/correlation-id';
import type {
  AmqpConfirmChannel,
  AmqpConnection,
  AmqpConnector,
  AmqpMessage,
  AmqpPublishOptions,
} from '../types/amqp';
import type { ApplicationLogger } from '../types/application-logger';
import type { OnboardingEventPublisher } from '../types/onboarding-event-publisher';
import type { OnboardingTriggerHandler } from '../types/onboarding-trigger-handler';

const EVENT_EXCHANGE = 'hcm.events.v1';
const DEAD_LETTER_EXCHANGE = 'hcm.events.dlx.v1';
const ONBOARDING_QUEUE = 'hcm.onboarding.review.v1';
const DEAD_LETTER_QUEUE = 'hcm.onboarding.review.dlq.v1';
const EVENT_ROUTING_KEY = 'onboarding.review.requested';
const DEAD_LETTER_ROUTING_KEY = 'onboarding.review.dead';
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function deliveryAttempt(message: AmqpMessage): number {
  const value = message.properties.headers?.['x-attempt'];
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

function stableErrorCode(error: unknown): string {
  return resolveApplicationErrorCode(error, CommonErrorCode.InternalError);
}

function safeMessageId(value: string | undefined): string | undefined {
  return value && value.length <= 128 && SAFE_IDENTIFIER.test(value) ? value : undefined;
}

export class RabbitMqOnboardingTransport implements OnboardingEventPublisher {
  private connection?: AmqpConnection;
  private channel?: AmqpConfirmChannel;
  private consumerTag?: string;

  public constructor(
    private readonly dependencies: {
      amqpUrl: string;
      connector: AmqpConnector;
      processor: OnboardingTriggerHandler;
      logger: ApplicationLogger;
      prefetch: number;
      maxAttempts: number;
    },
  ) {}

  public async start(): Promise<void> {
    if (this.channel) return;
    const connection = await this.dependencies.connector.connect(this.dependencies.amqpUrl);
    const channel = await connection.createConfirmChannel();
    await channel.assertExchange(EVENT_EXCHANGE, 'topic', { durable: true });
    await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'topic', { durable: true });
    await channel.assertQueue(ONBOARDING_QUEUE, { durable: true });
    await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
    await channel.bindQueue(ONBOARDING_QUEUE, EVENT_EXCHANGE, EVENT_ROUTING_KEY);
    await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, DEAD_LETTER_ROUTING_KEY);
    await channel.prefetch(this.dependencies.prefetch);

    this.connection = connection;
    this.channel = channel;
    const consumer = await channel.consume(
      ONBOARDING_QUEUE,
      async (message) => {
        if (!message) return;
        await this.consumeMessage(message).catch(() => undefined);
      },
      { noAck: false },
    );
    this.consumerTag = consumer.consumerTag;
  }

  public async publish(event: OnboardingTriggerEvent, attempt: number): Promise<void> {
    const correlationId = resolveSafeCorrelationId(event.correlationId);
    const publishedEvent = { ...event, correlationId };
    const options: AmqpPublishOptions = {
      persistent: true,
      contentType: 'application/json',
      type: event.type,
      messageId: event.eventId,
      correlationId,
      timestamp: Date.parse(event.occurredAt),
      headers: { 'x-attempt': attempt, 'x-event-version': event.version },
    };
    await this.confirmedPublish(
      EVENT_EXCHANGE,
      EVENT_ROUTING_KEY,
      Buffer.from(JSON.stringify(publishedEvent)),
      options,
    );
    this.dependencies.logger.info({
      event: 'rabbitmq.event.publish_confirmed',
      correlationId,
      messageId: event.eventId,
      attempt,
      routingKey: EVENT_ROUTING_KEY,
      status: 'ACCEPTED',
    });
  }

  public async close(): Promise<void> {
    const channel = this.channel;
    const connection = this.connection;
    const consumerTag = this.consumerTag;
    this.consumerTag = undefined;
    this.channel = undefined;
    this.connection = undefined;

    if (channel && consumerTag) {
      await channel.cancel(consumerTag).catch(() => undefined);
    }
    if (channel) {
      await channel.close().catch(() => undefined);
    }
    if (connection) {
      await connection.close().catch(() => undefined);
    }
  }

  private async consumeMessage(message: AmqpMessage): Promise<void> {
    const channel = this.requireChannel();
    const attempt = deliveryAttempt(message);
    const correlationId = resolveSafeCorrelationId(message.properties.correlationId);
    const messageId = safeMessageId(message.properties.messageId);
    const safeType = message.properties.type === EVENT_ROUTING_KEY ? EVENT_ROUTING_KEY : undefined;
    const metadata = { correlationId, messageId, attempt, routingKey: EVENT_ROUTING_KEY };
    this.dependencies.logger.info({
      event: 'rabbitmq.event.received',
      ...metadata,
      status: 'RECEIVED',
    });

    try {
      const event = this.parseEvent(message.content);
      const result = await this.dependencies.processor.process({
        event,
        triggerType: 'RABBITMQ',
        attempt,
      });
      if (result.status === 'COMPLETED') {
        this.dependencies.logger.info({
          event: 'rabbitmq.event.completed',
          ...metadata,
          status: 'COMPLETED',
          runId: result.runId,
        });
      } else {
        this.dependencies.logger.info({
          event: 'rabbitmq.event.duplicate',
          ...metadata,
          status: 'DUPLICATE',
        });
      }
      channel.ack(message);
    } catch (error) {
      const code = stableErrorCode(error);
      if (code === TriggerErrorCode.EventIdConflict) {
        this.dependencies.logger.warn({
          event: 'rabbitmq.event.conflict',
          ...metadata,
          status: 'FAILED',
          code,
        });
      }
      if (code === TriggerErrorCode.RabbitMqEventValidationFailed) {
        this.dependencies.logger.warn({
          event: 'rabbitmq.event.validation_failed',
          ...metadata,
          status: 'FAILED',
          code,
        });
      }

      if (attempt < this.dependencies.maxAttempts) {
        await this.confirmedPublish(EVENT_EXCHANGE, EVENT_ROUTING_KEY, message.content, {
          persistent: true,
          contentType: 'application/json',
          type: safeType,
          messageId,
          correlationId,
          timestamp: undefined,
          headers: { 'x-attempt': attempt + 1, 'x-event-version': '1' },
        });
        this.dependencies.logger.warn({
          event: 'rabbitmq.event.retry_published',
          ...metadata,
          nextAttempt: attempt + 1,
          status: 'RETRYING',
          code,
        });
      } else {
        await this.confirmedPublish(
          DEAD_LETTER_EXCHANGE,
          DEAD_LETTER_ROUTING_KEY,
          message.content,
          {
            persistent: true,
            contentType: 'application/json',
            type: safeType,
            messageId,
            correlationId,
            timestamp: undefined,
            headers: {
              'x-attempt': attempt,
              'x-event-version': '1',
              'x-error-code': code,
            },
          },
        );
        this.dependencies.logger.error({
          event: 'rabbitmq.event.dead_lettered',
          correlationId,
          messageId,
          attempt,
          routingKey: DEAD_LETTER_ROUTING_KEY,
          status: 'DEAD_LETTERED',
          code,
        });
      }
      channel.ack(message);
    }
  }

  private parseEvent(content: Buffer): OnboardingTriggerEvent {
    try {
      return onboardingTriggerEventSchema.parse(JSON.parse(content.toString('utf8')));
    } catch {
      throw new ApplicationError(TriggerErrorCode.RabbitMqEventValidationFailed);
    }
  }

  private async confirmedPublish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: AmqpPublishOptions,
  ): Promise<void> {
    const channel = this.requireChannel();
    channel.publish(exchange, routingKey, content, options);
    await channel.waitForConfirms();
  }

  private requireChannel(): AmqpConfirmChannel {
    if (!this.channel) throw new ApplicationError(TriggerErrorCode.RabbitMqNotStarted);
    return this.channel;
  }
}
