import { parseOnboardingTriggerEvent } from '../../src/contracts/onboarding-trigger-event';
import { RabbitMqOnboardingTransport } from '../../src/triggers/rabbitmq-onboarding.transport';
import type {
  AmqpConfirmChannel,
  AmqpConnection,
  AmqpConnector,
  AmqpMessage,
  AmqpPublishOptions,
} from '../../src/types/amqp';

const event = parseOnboardingTriggerEvent({
  version: '1',
  eventId: 'event-onboarding-001',
  type: 'onboarding.review.requested',
  occurredAt: '2026-08-09T05:00:00.000Z',
  correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
  data: { employeeCode: 'EMP-201', thresholdDays: 30, action: 'REVIEW_ONLY' },
});

function messageFor(attempt: number): AmqpMessage {
  return {
    content: Buffer.from(JSON.stringify(event)),
    properties: { headers: { 'x-attempt': attempt } },
  };
}

function fakeBroker() {
  let consumer: ((message: AmqpMessage | null) => Promise<void>) | undefined;
  const publications: Array<{
    exchange: string;
    routingKey: string;
    content: Buffer;
    options: AmqpPublishOptions;
  }> = [];
  const ack = jest.fn();
  const waitForConfirms = jest.fn().mockResolvedValue(undefined);
  const channel: AmqpConfirmChannel = {
    assertExchange: jest.fn().mockResolvedValue(undefined),
    assertQueue: jest.fn(async (queue: string) => ({ queue })),
    bindQueue: jest.fn().mockResolvedValue(undefined),
    prefetch: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn(async (_queue, callback) => {
      consumer = callback;
      return { consumerTag: 'consumer-onboarding-001' };
    }),
    publish: (exchange, routingKey, content, options) => {
      publications.push({ exchange, routingKey, content, options });
      return true;
    },
    waitForConfirms,
    ack,
    cancel: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const connection: AmqpConnection = {
    createConfirmChannel: jest.fn(async () => channel),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const connector: AmqpConnector = {
    connect: jest.fn(async () => connection),
  };
  return {
    ack,
    channel,
    connection,
    connector,
    publications,
    waitForConfirms,
    deliver: async (message: AmqpMessage) => {
      if (!consumer) throw new Error('CONSUMER_NOT_REGISTERED');
      await consumer(message);
    },
  };
}

function createTransport(broker: ReturnType<typeof fakeBroker>, process = jest.fn()) {
  return new RabbitMqOnboardingTransport({
    amqpUrl: 'amqp://localhost:5672',
    connector: broker.connector,
    processor: { process },
    prefetch: 5,
    maxAttempts: 3,
  });
}

describe('RabbitMqOnboardingTransport', () => {
  it('declares durable versioned topology with manual ack and bounded prefetch', async () => {
    const broker = fakeBroker();
    const transport = createTransport(broker);

    await transport.start();

    expect(broker.channel.assertExchange).toHaveBeenNthCalledWith(1, 'hcm.events.v1', 'topic', {
      durable: true,
    });
    expect(broker.channel.assertExchange).toHaveBeenNthCalledWith(2, 'hcm.events.dlx.v1', 'topic', {
      durable: true,
    });
    expect(broker.channel.assertQueue).toHaveBeenNthCalledWith(1, 'hcm.onboarding.review.v1', {
      durable: true,
    });
    expect(broker.channel.assertQueue).toHaveBeenNthCalledWith(2, 'hcm.onboarding.review.dlq.v1', {
      durable: true,
    });
    expect(broker.channel.bindQueue).toHaveBeenNthCalledWith(
      1,
      'hcm.onboarding.review.v1',
      'hcm.events.v1',
      'onboarding.review.requested',
    );
    expect(broker.channel.bindQueue).toHaveBeenNthCalledWith(
      2,
      'hcm.onboarding.review.dlq.v1',
      'hcm.events.dlx.v1',
      'onboarding.review.dead',
    );
    expect(broker.channel.prefetch).toHaveBeenCalledWith(5);
    expect(broker.channel.consume).toHaveBeenCalledWith(
      'hcm.onboarding.review.v1',
      expect.any(Function),
      { noAck: false },
    );
  });

  it('publishes persistent typed events and waits for broker confirmation', async () => {
    const broker = fakeBroker();
    const transport = createTransport(broker);
    await transport.start();

    await transport.publish(event, 1);

    expect(broker.publications).toEqual([
      {
        exchange: 'hcm.events.v1',
        routingKey: 'onboarding.review.requested',
        content: Buffer.from(JSON.stringify(event)),
        options: {
          persistent: true,
          contentType: 'application/json',
          type: 'onboarding.review.requested',
          messageId: 'event-onboarding-001',
          correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
          timestamp: 1786251600000,
          headers: { 'x-attempt': 1, 'x-event-version': '1' },
        },
      },
    ]);
    expect(broker.waitForConfirms).toHaveBeenCalledTimes(1);
  });

  it('acknowledges only after successful idempotent processing', async () => {
    const broker = fakeBroker();
    const process = jest.fn().mockResolvedValue({ status: 'COMPLETED', runId: 'run-event-001' });
    const transport = createTransport(broker, process);
    await transport.start();
    const message = messageFor(1);

    await broker.deliver(message);

    expect(process).toHaveBeenCalledWith({ event, triggerType: 'RABBITMQ', attempt: 1 });
    expect(broker.ack).toHaveBeenCalledWith(message);
    expect(broker.publications).toHaveLength(0);
  });

  it('publishes and confirms a bounded retry before acknowledging the original', async () => {
    const broker = fakeBroker();
    const process = jest.fn().mockRejectedValue({ code: 'WORKFLOW_FAILED' });
    const transport = createTransport(broker, process);
    await transport.start();
    const message = messageFor(1);

    await broker.deliver(message);

    expect(broker.publications).toHaveLength(1);
    expect(broker.publications[0]).toMatchObject({
      exchange: 'hcm.events.v1',
      routingKey: 'onboarding.review.requested',
      options: { headers: { 'x-attempt': 2, 'x-event-version': '1' } },
    });
    expect(broker.waitForConfirms).toHaveBeenCalledTimes(1);
    expect(broker.ack).toHaveBeenCalledWith(message);
  });

  it('publishes a stable dead-letter after the final failed attempt', async () => {
    const broker = fakeBroker();
    const process = jest.fn().mockRejectedValue({ code: 'WORKFLOW_FAILED' });
    const transport = createTransport(broker, process);
    await transport.start();
    const message = messageFor(3);

    await broker.deliver(message);

    expect(broker.publications).toHaveLength(1);
    expect(broker.publications[0]).toMatchObject({
      exchange: 'hcm.events.dlx.v1',
      routingKey: 'onboarding.review.dead',
      options: {
        headers: {
          'x-attempt': 3,
          'x-event-version': '1',
          'x-error-code': 'WORKFLOW_FAILED',
        },
      },
    });
    expect(broker.waitForConfirms).toHaveBeenCalledTimes(1);
    expect(broker.ack).toHaveBeenCalledWith(message);
  });

  it('leaves the original unacknowledged when retry confirmation fails', async () => {
    const broker = fakeBroker();
    broker.waitForConfirms.mockRejectedValueOnce(new Error('confirm unavailable'));
    const process = jest.fn().mockRejectedValue({ code: 'WORKFLOW_FAILED' });
    const transport = createTransport(broker, process);
    await transport.start();

    await broker.deliver(messageFor(1));

    expect(broker.ack).not.toHaveBeenCalled();
  });

  it('cancels the consumer before closing the channel and connection', async () => {
    const broker = fakeBroker();
    const transport = createTransport(broker);
    await transport.start();

    await transport.close();

    expect(broker.channel.cancel).toHaveBeenCalledWith('consumer-onboarding-001');
    expect(broker.channel.close).toHaveBeenCalledTimes(1);
    expect(broker.connection.close).toHaveBeenCalledTimes(1);
  });
});
