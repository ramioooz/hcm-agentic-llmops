export type AmqpPublishOptions = {
  persistent: boolean;
  contentType: string;
  type?: string;
  messageId?: string;
  correlationId?: string;
  timestamp?: number;
  headers: Record<string, string | number>;
};

export type AmqpMessage = {
  content: Buffer;
  properties: {
    headers?: Record<string, unknown>;
    messageId?: string;
    correlationId?: string;
    type?: string;
  };
  nativeMessage?: unknown;
};

export type AmqpConfirmChannel = {
  assertExchange(name: string, type: string, options: { durable: boolean }): Promise<unknown>;
  assertQueue(name: string, options: { durable: boolean }): Promise<{ queue: string }>;
  bindQueue(queue: string, exchange: string, routingKey: string): Promise<unknown>;
  prefetch(count: number): Promise<unknown>;
  consume(
    queue: string,
    callback: (message: AmqpMessage | null) => Promise<void>,
    options: { noAck: false },
  ): Promise<{ consumerTag: string }>;
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: AmqpPublishOptions,
  ): boolean;
  waitForConfirms(): Promise<void>;
  ack(message: AmqpMessage): void;
  cancel(consumerTag: string): Promise<unknown>;
  close(): Promise<void>;
};

export type AmqpConnection = {
  createConfirmChannel(): Promise<AmqpConfirmChannel>;
  close(): Promise<void>;
};

export type AmqpConnector = {
  connect(url: string): Promise<AmqpConnection>;
};
