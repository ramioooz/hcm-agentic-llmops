import {
  connect,
  type ChannelModel,
  type ConfirmChannel,
  type ConsumeMessage,
  type Message,
  type Options,
} from 'amqplib';
import type {
  AmqpConfirmChannel,
  AmqpConnection,
  AmqpConnector,
  AmqpMessage,
  AmqpPublishOptions,
} from '../types/amqp';

function toMessage(message: ConsumeMessage): AmqpMessage {
  return {
    content: message.content,
    properties: {
      headers: message.properties.headers,
      messageId: message.properties.messageId,
      correlationId: message.properties.correlationId,
      type: message.properties.type,
    },
    nativeMessage: message,
  };
}

class ConfirmChannelAdapter implements AmqpConfirmChannel {
  public constructor(private readonly channel: ConfirmChannel) {}

  public assertExchange(name: string, type: string, options: { durable: boolean }) {
    return this.channel.assertExchange(name, type, options);
  }

  public assertQueue(name: string, options: { durable: boolean }) {
    return this.channel.assertQueue(name, options);
  }

  public bindQueue(queue: string, exchange: string, routingKey: string) {
    return this.channel.bindQueue(queue, exchange, routingKey);
  }

  public prefetch(count: number) {
    return this.channel.prefetch(count);
  }

  public consume(
    queue: string,
    callback: (message: AmqpMessage | null) => Promise<void>,
    options: { noAck: false },
  ) {
    return this.channel.consume(
      queue,
      (message) => void callback(message ? toMessage(message) : null),
      options,
    );
  }

  public publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: AmqpPublishOptions,
  ): boolean {
    return this.channel.publish(exchange, routingKey, content, options as Options.Publish);
  }

  public waitForConfirms(): Promise<void> {
    return this.channel.waitForConfirms();
  }

  public ack(message: AmqpMessage): void {
    this.channel.ack(message.nativeMessage as Message);
  }

  public cancel(consumerTag: string) {
    return this.channel.cancel(consumerTag);
  }

  public close(): Promise<void> {
    return this.channel.close();
  }
}

class ConnectionAdapter implements AmqpConnection {
  public constructor(private readonly connection: ChannelModel) {}

  public async createConfirmChannel(): Promise<AmqpConfirmChannel> {
    return new ConfirmChannelAdapter(await this.connection.createConfirmChannel());
  }

  public close(): Promise<void> {
    return this.connection.close();
  }
}

export class AmqplibConnector implements AmqpConnector {
  public async connect(url: string): Promise<AmqpConnection> {
    return new ConnectionAdapter(await connect(url));
  }
}
