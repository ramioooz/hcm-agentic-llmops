import type { Request, Response } from 'express';
import { AgentController } from '../../src/controllers/agent.controller';
import { HealthController } from '../../src/controllers/health.controller';
import type {
  OnboardingInvocationInput,
  OnboardingInvocationResult,
} from '../../src/services/onboarding-agent.service';

type InvokeFunction = (input: OnboardingInvocationInput) => Promise<OnboardingInvocationResult>;

type CapturedResponse = {
  body: unknown;
  response: Response;
  statusCode: number;
};

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
  test('returns 503 when the agent service is not configured', async () => {
    const controller = new AgentController();
    const captured = captureResponse();

    await controller.handleInvoke(
      requestWith({
        body: { query: 'Review onboarding for EMP-1001' },
        headers: { 'X-Correlation-Id': 'correlation-503' },
      }),
      captured.response,
    );

    expect(captured.statusCode).toBe(503);
    expect(captured.body).toEqual({
      status: 'FAILED',
      code: 'AGENT_NOT_CONFIGURED',
      message: 'The agent service is not configured.',
      correlationId: 'correlation-503',
    });
  });

  test('returns the agent service HTTP result for a valid request', async () => {
    const invoke = jest
      .fn<ReturnType<InvokeFunction>, Parameters<InvokeFunction>>()
      .mockResolvedValue({
        httpStatus: 200,
        body: {
          status: 'COMPLETED',
          message: 'Employee onboarding review completed.',
          runId: 'run-123',
          correlationId: 'correlation-123',
        },
      });
    const controller = new AgentController({ invoke });
    const captured = captureResponse();

    await controller.handleInvoke(
      requestWith({
        body: { query: 'Review onboarding for EMP-1001' },
        headers: {
          'X-Correlation-Id': 'correlation-123',
          'X-Employee-Id': 'EMP-9000',
          'X-User-Role': 'HR',
        },
      }),
      captured.response,
    );

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toEqual({
      status: 'COMPLETED',
      message: 'Employee onboarding review completed.',
      runId: 'run-123',
      correlationId: 'correlation-123',
    });
    expect(invoke).toHaveBeenCalledWith({
      query: 'Review onboarding for EMP-1001',
      actorEmployeeCode: 'EMP-9000',
      actorRole: 'HR',
      correlationId: 'correlation-123',
    });
  });

  test('returns 400 for an invalid body without invoking the agent service', async () => {
    const invoke = jest.fn<ReturnType<InvokeFunction>, Parameters<InvokeFunction>>();
    const controller = new AgentController({ invoke });
    const captured = captureResponse();

    await controller.handleInvoke(
      requestWith({
        body: { query: '' },
        headers: {
          'X-Employee-Id': 'EMP-9000',
          'X-User-Role': 'HR',
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
  });

  test.each([
    { description: 'missing employee identity', headers: { 'X-User-Role': 'HR' } },
    { description: 'missing role', headers: { 'X-Employee-Id': 'EMP-9000' } },
    {
      description: 'unsupported role',
      headers: { 'X-Employee-Id': 'EMP-9000', 'X-User-Role': 'ADMIN' },
    },
  ])('returns 401 for $description', async ({ headers }) => {
    const invoke = jest.fn<ReturnType<InvokeFunction>, Parameters<InvokeFunction>>();
    const controller = new AgentController({ invoke });
    const captured = captureResponse();

    await controller.handleInvoke(
      requestWith({ body: { query: 'Review EMP-1001 onboarding' }, headers }),
      captured.response,
    );

    expect(captured.statusCode).toBe(401);
    expect(captured.body).toMatchObject({
      status: 'FAILED',
      code: 'AUTHENTICATION_REQUIRED',
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  test('returns the structured 500 response when the service fails unexpectedly', async () => {
    const invoke = jest
      .fn<ReturnType<InvokeFunction>, Parameters<InvokeFunction>>()
      .mockRejectedValue(new Error('database down'));
    const controller = new AgentController({ invoke });
    const captured = captureResponse();

    await controller.handleInvoke(
      requestWith({
        body: { query: 'Review EMP-1001 onboarding' },
        headers: {
          'X-Correlation-Id': 'correlation-500',
          'X-Employee-Id': 'EMP-9000',
          'X-User-Role': 'HR',
        },
      }),
      captured.response,
    );

    expect(captured.statusCode).toBe(500);
    expect(captured.body).toEqual({
      status: 'FAILED',
      code: 'INTERNAL_ERROR',
      message: 'The workflow could not be completed.',
      correlationId: 'correlation-500',
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
