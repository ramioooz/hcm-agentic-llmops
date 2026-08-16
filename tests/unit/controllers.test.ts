import type { Request, Response } from 'express';
import { AgentController } from '../../src/controllers/agent.controller';
import { KnowledgeController } from '../../src/controllers/knowledge.controller';
import type { ApplicationLogger } from '../../src/types/application-logger';
import type { OperationalLogEntry } from '../../src/types/operational-log-entry';
import { HealthController } from '../../src/controllers/health.controller';
import type { OnboardingInvocationInput } from '../../src/types/onboarding-invocation-input';
import type { OnboardingInvocationResult } from '../../src/types/onboarding-invocation-result';

type InvokeFunction = (input: OnboardingInvocationInput) => Promise<OnboardingInvocationResult>;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function agentWith(invoke: InvokeFunction) {
  return {
    invoke,
    async *stream(): AsyncIterable<never> {},
  };
}

type CapturedResponse = {
  body: unknown;
  headers: Record<string, string>;
  response: Response;
  statusCode: number;
};

type CapturedLogger = {
  error: jest.Mock<void, [OperationalLogEntry]>;
  info: jest.Mock<void, [OperationalLogEntry]>;
  logger: ApplicationLogger;
  warn: jest.Mock<void, [OperationalLogEntry]>;
};

function captureLogger(): CapturedLogger {
  const info = jest.fn<void, [OperationalLogEntry]>();
  const warn = jest.fn<void, [OperationalLogEntry]>();
  const error = jest.fn<void, [OperationalLogEntry]>();

  return {
    info,
    warn,
    error,
    logger: { info, warn, error },
  };
}

function requestWith(input: {
  body?: unknown;
  headers?: Record<string, string | undefined>;
}): Request {
  const headers = Object.fromEntries(
    Object.entries(input.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
  );

  return {
    body: input.body,
    header: (name: string) => headers[name.toLowerCase()],
  } as Request;
}

function captureResponse(): CapturedResponse {
  const captured = {
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    statusCode: 0,
  };
  const response = {
    status: (statusCode: number) => {
      captured.statusCode = statusCode;
      return response;
    },
    json: (body: unknown) => {
      captured.body = body;
      return response;
    },
    setHeader: (name: string, value: string) => {
      captured.headers[name] = value;
      return response;
    },
  } as Response;

  return {
    get body() {
      return captured.body;
    },
    get headers() {
      return captured.headers;
    },
    response,
    get statusCode() {
      return captured.statusCode;
    },
  };
}

describe('AgentController', () => {
  test('rejects a malformed supplied thread ID without replacing it', async () => {
    const invoke = jest.fn<ReturnType<InvokeFunction>, Parameters<InvokeFunction>>();
    const controller = new AgentController({
      agent: agentWith(invoke),
      logger: captureLogger().logger,
    });
    const captured = captureResponse();

    await controller.handleInvoke(
      requestWith({
        body: { query: 'Review onboarding for EMP-201' },
        headers: {
          'X-Employee-Id': 'EMP-200',
          'X-Thread-Id': 'not-a-thread-id',
        },
      }),
      captured.response,
    );

    expect(captured.statusCode).toBe(400);
    expect(captured.body).toMatchObject({
      status: 'FAILED',
      code: 'INVALID_THREAD_ID',
      message: 'X-Thread-Id must be a UUID v4.',
    });
    expect(captured.headers).not.toHaveProperty('X-Thread-Id');
    expect(invoke).not.toHaveBeenCalled();
  });

  test('generates a UUID v4 thread ID, passes distinct IDs, and echoes the thread header', async () => {
    const invoke = jest.fn(async (input: OnboardingInvocationInput) => ({
      httpStatus: 200,
      body: {
        status: 'NEED_MORE_INFORMATION',
        message: 'Please provide the employee ID.',
        threadId: (input as OnboardingInvocationInput & { threadId: string }).threadId,
        runId: (input as OnboardingInvocationInput & { runId: string }).runId,
        correlationId: input.correlationId,
      },
    }));
    const controller = new AgentController({
      agent: agentWith(invoke),
      logger: captureLogger().logger,
    });
    const captured = captureResponse();

    await controller.handleInvoke(
      requestWith({
        body: { query: 'Review onboarding status' },
        headers: { 'X-Employee-Id': 'EMP-200' },
      }),
      captured.response,
    );

    const input = invoke.mock.calls[0]?.[0];
    const identifiers = input as
      (OnboardingInvocationInput & { threadId: string; runId: string }) | undefined;
    expect(identifiers?.threadId).toMatch(UUID_PATTERN);
    expect(identifiers?.runId).toMatch(UUID_PATTERN);
    expect(input?.correlationId).toMatch(UUID_PATTERN);
    expect(
      new Set([identifiers?.threadId, identifiers?.runId, identifiers?.correlationId]).size,
    ).toBe(3);
    expect(captured.headers['X-Thread-Id']).toBe(identifiers?.threadId);
    expect(captured.body).toMatchObject({
      threadId: identifiers?.threadId,
      runId: identifiers?.runId,
      correlationId: identifiers?.correlationId,
    });
  });

  test('preserves a supplied JSON thread ID and regenerates a colliding correlation ID', async () => {
    const suppliedId = '8b8a6d62-bf1c-4abf-9968-84b8e23b58cb';
    const invoke = jest.fn(async (input: OnboardingInvocationInput) => ({
      httpStatus: 200,
      body: {
        status: 'NEED_MORE_INFORMATION',
        message: 'Please provide the employee ID.',
        threadId: input.threadId as string,
        runId: input.runId as string,
        correlationId: input.correlationId,
      },
    }));
    const controller = new AgentController({
      agent: agentWith(invoke),
      logger: captureLogger().logger,
    });
    const captured = captureResponse();

    await controller.handleInvoke(
      requestWith({
        body: { query: 'Review onboarding status' },
        headers: {
          'X-Employee-Id': 'EMP-200',
          'X-Thread-Id': suppliedId,
          'X-Correlation-Id': suppliedId,
        },
      }),
      captured.response,
    );

    const input = invoke.mock.calls[0]?.[0];
    expect(input?.threadId).toBe(suppliedId);
    expect(input?.correlationId).toMatch(UUID_PATTERN);
    expect(input?.correlationId).not.toBe(suppliedId);
    expect(captured.headers['X-Thread-Id']).toBe(suppliedId);
    expect(captured.body).toMatchObject({
      threadId: suppliedId,
      correlationId: input?.correlationId,
    });
  });

  test('passes distinct supplied thread and correlation IDs into the shared SSE service input', async () => {
    const suppliedId = '8b8a6d62-bf1c-4abf-9968-84b8e23b58cb';
    const invoke = jest.fn<ReturnType<InvokeFunction>, Parameters<InvokeFunction>>();
    const stream = jest.fn().mockImplementation(async function* () {});
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    } as unknown as Response;
    const controller = new AgentController({
      agent: { invoke, stream },
      logger: captureLogger().logger,
    });

    await controller.handleInvoke(
      requestWith({
        body: { query: 'Review onboarding status' },
        headers: {
          Accept: 'text/event-stream',
          'X-Employee-Id': 'EMP-200',
          'X-Thread-Id': suppliedId,
          'X-Correlation-Id': suppliedId,
        },
      }),
      response,
    );

    const input = stream.mock.calls[0]?.[0] as OnboardingInvocationInput | undefined;
    expect(input?.threadId).toBe(suppliedId);
    expect(input?.correlationId).toMatch(UUID_PATTERN);
    expect(input?.correlationId).not.toBe(suppliedId);
  });

  test('returns the agent service HTTP result for a valid request', async () => {
    const invoke = jest
      .fn<ReturnType<InvokeFunction>, Parameters<InvokeFunction>>()
      .mockResolvedValue({
        httpStatus: 200,
        body: {
          status: 'COMPLETED',
          message: 'Employee onboarding review completed.',
          threadId: '8b8a6d62-bf1c-4abf-9968-84b8e23b58cb',
          runId: 'run-123',
          correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
        },
      });
    const logs = captureLogger();
    const controller = new AgentController({ agent: agentWith(invoke), logger: logs.logger });
    const captured = captureResponse();

    await controller.handleInvoke(
      requestWith({
        body: { query: 'Review onboarding for EMP-1001' },
        headers: {
          'X-Correlation-Id': '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
          'X-Employee-Id': 'EMP-9000',
          'X-Thread-Id': '8b8a6d62-bf1c-4abf-9968-84b8e23b58cb',
        },
      }),
      captured.response,
    );

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toEqual({
      status: 'COMPLETED',
      message: 'Employee onboarding review completed.',
      threadId: '8b8a6d62-bf1c-4abf-9968-84b8e23b58cb',
      runId: 'run-123',
      correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
    });
    expect(captured.headers['X-Thread-Id']).toBe('8b8a6d62-bf1c-4abf-9968-84b8e23b58cb');
    expect(invoke).toHaveBeenCalledWith({
      kind: 'USER_QUERY',
      query: 'Review onboarding for EMP-1001',
      actorEmployeeCode: 'EMP-9000',
      threadId: '8b8a6d62-bf1c-4abf-9968-84b8e23b58cb',
      runId: expect.any(String),
      correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
      triggerType: 'HTTP',
    });
    expect(logs.info).toHaveBeenNthCalledWith(1, {
      event: 'agent.invoke.started',
      correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
    });
    expect(logs.info).toHaveBeenNthCalledWith(2, {
      event: 'agent.invoke.completed',
      correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
      runId: 'run-123',
      status: 'COMPLETED',
      httpStatus: 200,
    });
  });

  test('replaces a hostile correlation header before invocation or logging', async () => {
    const hostileCorrelation = 'Review EMP-201 secret=sk-live-query-bearing-value';
    const invoke = jest.fn(async (input: OnboardingInvocationInput) => ({
      httpStatus: 200,
      body: {
        status: 'COMPLETED',
        message: 'Employee onboarding review completed.',
        threadId: (input as OnboardingInvocationInput & { threadId: string }).threadId,
        runId: 'run-safe-correlation',
        correlationId: input.correlationId,
      },
    }));
    const logs = captureLogger();
    const controller = new AgentController({ agent: agentWith(invoke), logger: logs.logger });
    const captured = captureResponse();

    await controller.handleInvoke(
      requestWith({
        body: { query: 'Review onboarding for EMP-201' },
        headers: {
          'X-Correlation-Id': hostileCorrelation,
          'X-Employee-Id': 'EMP-200',
        },
      }),
      captured.response,
    );

    const invocation = invoke.mock.calls[0]?.[0];
    expect(invocation?.correlationId).toMatch(UUID_PATTERN);
    expect(captured.body).toMatchObject({ correlationId: invocation?.correlationId });
    const logEntries = [
      ...logs.info.mock.calls,
      ...logs.warn.mock.calls,
      ...logs.error.mock.calls,
    ].map(([entry]) => entry);
    expect(logEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ correlationId: invocation?.correlationId }),
      ]),
    );
    expect(JSON.stringify(logEntries)).not.toContain(hostileCorrelation);
  });

  test('writes safe SSE lifecycle events when requested', async () => {
    const invoke = jest.fn<ReturnType<InvokeFunction>, Parameters<InvokeFunction>>();
    const stream = jest.fn().mockImplementation(async function* () {
      yield {
        event: 'run' as const,
        data: {
          threadId: '8b8a6d62-bf1c-4abf-9968-84b8e23b58cb',
          runId: 'run-sse',
          correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
          status: 'started' as const,
          triggerType: 'HTTP' as const,
        },
      };
      yield {
        event: 'response' as const,
        data: {
          runId: 'run-sse',
          status: 'completed' as const,
          httpStatus: 200,
          body: {
            status: 'COMPLETED',
            message: 'Employee onboarding review completed.',
            threadId: '8b8a6d62-bf1c-4abf-9968-84b8e23b58cb',
            runId: 'run-sse',
            correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
          },
        },
      };
    });
    const chunks: string[] = [];
    const headers: Record<string, string> = {};
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
      flushHeaders: jest.fn(),
      write: (chunk: string) => chunks.push(chunk),
      end: jest.fn(),
    } as unknown as Response;
    const controller = new AgentController({
      agent: { invoke, stream },
      logger: captureLogger().logger,
    });

    await controller.handleInvoke(
      requestWith({
        body: { query: 'Review onboarding for EMP-201' },
        headers: {
          Accept: 'text/event-stream',
          'X-Correlation-Id': '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
          'X-Employee-Id': 'EMP-200',
        },
      }),
      response,
    );

    expect(headers['Content-Type']).toBe('text/event-stream');
    expect(chunks.join('')).toContain('event: run\n');
    expect(chunks.join('')).toContain('event: response\n');
    expect(stream).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'USER_QUERY',
        query: 'Review onboarding for EMP-201',
        actorEmployeeCode: 'EMP-200',
        threadId: expect.stringMatching(UUID_PATTERN),
        runId: expect.stringMatching(UUID_PATTERN),
        correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
        triggerType: 'HTTP',
      }),
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  test('finishes SSE with a safe response event when the stream throws after starting', async () => {
    const invoke = jest.fn<ReturnType<InvokeFunction>, Parameters<InvokeFunction>>();
    const stream = jest.fn().mockImplementation(async function* () {
      yield {
        event: 'run' as const,
        data: {
          threadId: '8b8a6d62-bf1c-4abf-9968-84b8e23b58cb',
          runId: '6a650be1-90c6-49fb-966f-4608b10060ac',
          correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
          status: 'started' as const,
          triggerType: 'HTTP' as const,
        },
      };
      throw new Error('provider secret details');
    });
    const chunks: string[] = [];
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: (chunk: string) => chunks.push(chunk),
      end: jest.fn(),
    } as unknown as Response;
    const logs = captureLogger();
    const controller = new AgentController({ agent: { invoke, stream }, logger: logs.logger });

    await controller.handleInvoke(
      requestWith({
        body: { query: 'Review onboarding for EMP-201' },
        headers: {
          Accept: 'text/event-stream',
          'X-Correlation-Id': '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
          'X-Employee-Id': 'EMP-200',
        },
      }),
      response,
    );

    const output = chunks.join('');
    expect(output).toContain('event: run\n');
    expect(output).toContain('event: response\n');
    expect(output).toContain('"httpStatus":500');
    expect(output).toContain('"code":"INTERNAL_ERROR"');
    expect(output).not.toContain('provider secret details');
    const finalFrame = output.trim().split('\n\n').at(-1)?.split('\n');
    expect(JSON.parse(finalFrame?.[1]?.slice('data: '.length) ?? '{}')).toEqual({
      runId: '6a650be1-90c6-49fb-966f-4608b10060ac',
      status: 'completed',
      httpStatus: 500,
      body: {
        status: 'FAILED',
        code: 'INTERNAL_ERROR',
        message: 'The workflow could not be completed.',
        threadId: expect.stringMatching(UUID_PATTERN),
        runId: '6a650be1-90c6-49fb-966f-4608b10060ac',
        correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
      },
    });
    expect(response.json).not.toHaveBeenCalled();
    expect(response.end).toHaveBeenCalledTimes(1);
    expect(logs.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'agent.invoke.failed',
        correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
        code: 'INTERNAL_ERROR',
        httpStatus: 500,
      }),
    );
  });

  test('returns 400 for an invalid body without invoking the agent service', async () => {
    const invoke = jest.fn<ReturnType<InvokeFunction>, Parameters<InvokeFunction>>();
    const logs = captureLogger();
    const controller = new AgentController({ agent: agentWith(invoke), logger: logs.logger });
    const captured = captureResponse();

    await controller.handleInvoke(
      requestWith({
        body: { query: '' },
        headers: {
          'X-Employee-Id': 'EMP-9000',
        },
      }),
      captured.response,
    );

    expect(captured.statusCode).toBe(400);
    expect(captured.body).toMatchObject({
      status: 'FAILED',
      code: 'VALIDATION_ERROR',
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(logs.warn).toHaveBeenCalledWith({
      event: 'agent.invoke.rejected',
      correlationId: expect.any(String),
      status: 'FAILED',
      code: 'VALIDATION_ERROR',
      httpStatus: 400,
    });
  });

  test('returns 401 for missing employee identity', async () => {
    const invoke = jest.fn<ReturnType<InvokeFunction>, Parameters<InvokeFunction>>();
    const logs = captureLogger();
    const controller = new AgentController({ agent: agentWith(invoke), logger: logs.logger });
    const captured = captureResponse();

    await controller.handleInvoke(
      requestWith({ body: { query: 'Review EMP-1001 onboarding' }, headers: {} }),
      captured.response,
    );

    expect(captured.statusCode).toBe(401);
    expect(captured.body).toMatchObject({
      status: 'FAILED',
      code: 'AUTHENTICATION_REQUIRED',
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(logs.warn).toHaveBeenCalledWith({
      event: 'agent.invoke.rejected',
      correlationId: expect.any(String),
      status: 'FAILED',
      code: 'AUTHENTICATION_REQUIRED',
      httpStatus: 401,
    });
  });

  test('returns 401 for a malformed employee identity', async () => {
    const invoke = jest.fn<ReturnType<InvokeFunction>, Parameters<InvokeFunction>>();
    const logs = captureLogger();
    const controller = new AgentController({
      agent: agentWith(invoke),
      logger: logs.logger,
    });
    const captured = captureResponse();

    await controller.handleInvoke(
      requestWith({
        body: { query: 'Review EMP-1001 onboarding' },
        headers: { 'X-Employee-Id': 'not-an-employee-code' },
      }),
      captured.response,
    );

    expect(captured.statusCode).toBe(401);
    expect(captured.body).toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
    expect(invoke).not.toHaveBeenCalled();
  });

  test('returns the structured 500 response when the service fails unexpectedly', async () => {
    const invoke = jest
      .fn<ReturnType<InvokeFunction>, Parameters<InvokeFunction>>()
      .mockRejectedValue(new Error('database down'));
    const logs = captureLogger();
    const controller = new AgentController({ agent: agentWith(invoke), logger: logs.logger });
    const captured = captureResponse();

    await controller.handleInvoke(
      requestWith({
        body: { query: 'Review EMP-1001 onboarding' },
        headers: {
          'X-Correlation-Id': '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
          'X-Employee-Id': 'EMP-9000',
        },
      }),
      captured.response,
    );

    expect(captured.statusCode).toBe(500);
    expect(captured.body).toEqual({
      status: 'FAILED',
      code: 'INTERNAL_ERROR',
      message: 'The workflow could not be completed.',
      threadId: expect.stringMatching(UUID_PATTERN),
      runId: expect.stringMatching(UUID_PATTERN),
      correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
    });
    expect(logs.error).toHaveBeenCalledWith({
      event: 'agent.invoke.failed',
      correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
      status: 'FAILED',
      code: 'INTERNAL_ERROR',
      httpStatus: 500,
    });
  });

  test('logs a handled 4xx service result as a rejection', async () => {
    const invoke = jest
      .fn<ReturnType<InvokeFunction>, Parameters<InvokeFunction>>()
      .mockResolvedValue({
        httpStatus: 403,
        body: {
          status: 'FAILED',
          code: 'AUTHORIZATION_DENIED',
          message: 'You are not authorized to perform this operation.',
          threadId: '8b8a6d62-bf1c-4abf-9968-84b8e23b58cb',
          runId: 'run-403',
          correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
        },
      });
    const logs = captureLogger();
    const controller = new AgentController({ agent: agentWith(invoke), logger: logs.logger });
    const captured = captureResponse();

    await controller.handleInvoke(
      requestWith({
        body: { query: 'Review EMP-1001 onboarding' },
        headers: {
          'X-Correlation-Id': '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
          'X-Employee-Id': 'EMP-9000',
        },
      }),
      captured.response,
    );

    expect(captured.statusCode).toBe(403);
    expect(logs.warn).toHaveBeenCalledWith({
      event: 'agent.invoke.rejected',
      correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
      runId: 'run-403',
      status: 'FAILED',
      code: 'AUTHORIZATION_DENIED',
      httpStatus: 403,
    });
  });

  test('logs a handled service 500 result as a failure', async () => {
    const invoke = jest
      .fn<ReturnType<InvokeFunction>, Parameters<InvokeFunction>>()
      .mockResolvedValue({
        httpStatus: 500,
        body: {
          status: 'FAILED',
          code: 'INTERNAL_ERROR',
          message: 'The workflow could not be completed.',
          threadId: '8b8a6d62-bf1c-4abf-9968-84b8e23b58cb',
          runId: 'run-service-500',
          correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
        },
      });
    const logs = captureLogger();
    const controller = new AgentController({ agent: agentWith(invoke), logger: logs.logger });
    const captured = captureResponse();

    await controller.handleInvoke(
      requestWith({
        body: { query: 'Review EMP-1001 onboarding' },
        headers: {
          'X-Correlation-Id': '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
          'X-Employee-Id': 'EMP-9000',
        },
      }),
      captured.response,
    );

    expect(captured.statusCode).toBe(500);
    expect(logs.error).toHaveBeenCalledWith({
      event: 'agent.invoke.failed',
      correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
      runId: 'run-service-500',
      status: 'FAILED',
      code: 'INTERNAL_ERROR',
      httpStatus: 500,
    });
  });

  test('logs a handled service 200 rejection outcome as completed', async () => {
    const invoke = jest
      .fn<ReturnType<InvokeFunction>, Parameters<InvokeFunction>>()
      .mockResolvedValue({
        httpStatus: 200,
        body: {
          status: 'NEED_MORE_INFORMATION',
          message: 'Please provide the employee ID.',
          threadId: '8b8a6d62-bf1c-4abf-9968-84b8e23b58cb',
          runId: 'run-more-information',
          correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
        },
      });
    const logs = captureLogger();
    const controller = new AgentController({ agent: agentWith(invoke), logger: logs.logger });
    const captured = captureResponse();

    await controller.handleInvoke(
      requestWith({
        body: { query: 'Review onboarding' },
        headers: {
          'X-Correlation-Id': '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
          'X-Employee-Id': 'EMP-9000',
        },
      }),
      captured.response,
    );

    expect(captured.statusCode).toBe(200);
    expect(logs.info).toHaveBeenCalledWith({
      event: 'agent.invoke.completed',
      correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
      runId: 'run-more-information',
      status: 'NEED_MORE_INFORMATION',
      httpStatus: 200,
    });
    expect(logs.warn).not.toHaveBeenCalled();
  });
});

describe('KnowledgeController', () => {
  test('explains that caller-controlled retrieval limits are unsupported', async () => {
    const controller = new KnowledgeController({
      employees: { findByEmployeeCode: jest.fn() },
      enabled: true,
    });
    const captured = captureResponse();

    await controller.handleQuery(
      requestWith({
        body: {
          query: 'How many remote days are allowed?',
          limit: 5,
        },
      }),
      captured.response,
    );

    expect(captured.statusCode).toBe(400);
    expect(captured.body).toEqual({
      status: 'FAILED',
      code: 'KNOWLEDGE_QUERY_INVALID',
      message:
        'Send only a non-empty query of at most 2,000 characters. The limit field is not supported because retrieval limits are configured by the server.',
    });
  });
});

describe('HealthController', () => {
  test('returns 200 for the liveness endpoint', () => {
    const controller = new HealthController(async () => undefined);
    const captured = captureResponse();

    controller.handleHealth(requestWith({}), captured.response);

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toEqual({ status: 'ok' });
  });

  test('returns 200 when the database readiness check succeeds', async () => {
    const controller = new HealthController(async () => undefined);
    const captured = captureResponse();

    await controller.handleReady(requestWith({}), captured.response);

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toEqual({ status: 'ready' });
  });

  test('returns 503 when the database readiness check fails', async () => {
    const controller = new HealthController(async () => {
      throw new Error('database down');
    });
    const captured = captureResponse();

    await controller.handleReady(requestWith({}), captured.response);

    expect(captured.statusCode).toBe(503);
    expect(captured.body).toEqual({ status: 'not_ready' });
  });
});
