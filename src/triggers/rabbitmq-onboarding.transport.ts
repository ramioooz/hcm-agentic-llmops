import {
  onboardingTriggerEventSchema,
  type OnboardingTriggerEvent,
} from '../contracts/onboarding-trigger-event';
import type {
  AmqpConfirmChannel,
  AmqpConnection,
  AmqpConnector,
  AmqpMessage,
  AmqpPublishOptions,
} from '../types/amqp';
import type { OnboardingEventPublisher } from '../types/onboarding-event-publisher';
import type { OnboardingTriggerHandler } from '../types/onboarding-trigger-handler';

const EVENT_EXCHANGE = 'hcm.events.v1';
const DEAD_LETTER_EXCHANGE = 'hcm.events.dlx.v1';
const ONBOARDING_QUEUE = 'hcm.onboarding.review.v1';
const DEAD_LETTER_QUEUE = 'hcm.onboarding.review.dlq.v1';
const EVENT_ROUTING_KEY = 'onboarding.review.requested';
const DEAD_LETTER_ROUTING_KEY = 'onboarding.review.dead';

function deliveryAttempt(message: AmqpMessage): number {
  const value = message.properties.headers?.['x-attempt'];
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

function stableErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return 'INTERNAL_ERROR';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : 'INTERNAL_ERROR';
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
    const options: AmqpPublishOptions = {
      persistent: true,
      contentType: 'application/json',
      type: event.type,
      messageId: event.eventId,
      correlationId: event.correlationId,
      timestamp: Date.parse(event.occurredAt),
      headers: { 'x-attempt': attempt, 'x-event-version': event.version },
    };
    await this.confirmedPublish(
      EVENT_EXCHANGE,
      EVENT_ROUTING_KEY,
      Buffer.from(JSON.stringify(event)),
      options,
    );
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
    try {
      const event = onboardingTriggerEventSchema.parse(
        JSON.parse(message.content.toString('utf8')),
      );
      await this.dependencies.processor.process({ event, triggerType: 'RABBITMQ', attempt });
      channel.ack(message);
    } catch (error) {
      if (attempt < this.dependencies.maxAttempts) {
        await this.confirmedPublish(EVENT_EXCHANGE, EVENT_ROUTING_KEY, message.content, {
          persistent: true,
          contentType: 'application/json',
          headers: { 'x-attempt': attempt + 1, 'x-event-version': '1' },
        });
      } else {
        await this.confirmedPublish(
          DEAD_LETTER_EXCHANGE,
          DEAD_LETTER_ROUTING_KEY,
          message.content,
          {
            persistent: true,
            contentType: 'application/json',
            headers: {
              'x-attempt': attempt,
              'x-event-version': '1',
              'x-error-code': stableErrorCode(error),
            },
          },
        );
      }
      channel.ack(message);
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
    if (!this.channel) throw new Error('RABBITMQ_NOT_STARTED');
    return this.channel;
  }
}
