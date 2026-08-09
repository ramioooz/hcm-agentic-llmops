import type { Request, Response } from 'express';
import { AgentController } from '../../src/controllers/agent.controller';
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
  } as Response;

  return {
    get body() {
      return captured.body;
    },
    response,
    get statusCode() {
      return captured.statusCode;
    },
  };
}

describe('AgentController', () => {
  test('returns the agent service HTTP result for a valid request', async () => {
    const invoke = jest
      .fn<ReturnType<InvokeFunction>, Parameters<InvokeFunction>>()
      .mockResolvedValue({
        httpStatus: 200,
        body: {
          status: 'COMPLETED',
          message: 'Employee onboarding review completed.',
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
        },
      }),
      captured.response,
    );

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toEqual({
      status: 'COMPLETED',
      message: 'Employee onboarding review completed.',
      runId: 'run-123',
      correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
    });
    expect(invoke).toHaveBeenCalledWith({
      kind: 'USER_QUERY',
      query: 'Review onboarding for EMP-1001',
      actorEmployeeCode: 'EMP-9000',
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
          runId: 'run-sse',
          correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
          status: 'started' as const,
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
    expect(stream).toHaveBeenCalledWith({
      kind: 'USER_QUERY',
      query: 'Review onboarding for EMP-201',
      actorEmployeeCode: 'EMP-200',
      correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
      triggerType: 'HTTP',
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  test('finishes SSE with a safe response event when the stream throws after starting', async () => {
    const invoke = jest.fn<ReturnType<InvokeFunction>, Parameters<InvokeFunction>>();
    const stream = jest.fn().mockImplementation(async function* () {
      yield {
        event: 'run' as const,
        data: {
          runId: '6a650be1-90c6-49fb-966f-4608b10060ac',
          correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
          status: 'started' as const,
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
