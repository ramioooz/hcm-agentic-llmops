import type { Request, Response } from 'express';
import {
  AgentController,
  type AgentInvocationService,
} from '../../src/controllers/agent.controller';
import { HealthController } from '../../src/controllers/health.controller';

function responseDouble() {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;

  jest.mocked(response.status).mockReturnValue(response);
  jest.mocked(response.json).mockReturnValue(response);

  return response;
}

function requestDouble(body: unknown, headers: Record<string, string | undefined> = {}): Request {
  return {
    body,
    header: jest.fn((name: string) => headers[name.toLowerCase()]),
  } as unknown as Request;
}

describe('AgentController', () => {
  it('delegates valid requests to the service and returns its result', async () => {
    const service: AgentInvocationService = {
      invoke: jest.fn().mockResolvedValue({
        httpStatus: 200,
        body: {
          status: 'COMPLETED',
          message: 'done',
          runId: 'run-001',
          correlationId: 'corr-001',
        },
      }),
    };
    const controller = new AgentController(service);
    const response = responseDouble();

    await controller.invoke(
      requestDouble(
        { query: 'Review EMP-201 onboarding status' },
        {
          'x-employee-id': 'EMP-200',
          'x-user-role': 'MANAGER',
          'x-correlation-id': 'corr-001',
        },
      ),
      response,
    );

    expect(service.invoke).toHaveBeenCalledWith({
      query: 'Review EMP-201 onboarding status',
      actorEmployeeCode: 'EMP-200',
      actorRole: 'MANAGER',
      correlationId: 'corr-001',
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      status: 'COMPLETED',
      message: 'done',
      runId: 'run-001',
      correlationId: 'corr-001',
    });
  });

  it('returns 400 without calling the service for an invalid body', async () => {
    const service: AgentInvocationService = { invoke: jest.fn() };
    const controller = new AgentController(service);
    const response = responseDouble();

    await controller.invoke(
      requestDouble({ query: '' }, { 'x-employee-id': 'EMP-200', 'x-user-role': 'MANAGER' }),
      response,
    );

    expect(service.invoke).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED', code: 'VALIDATION_ERROR' }),
    );
  });

  it('returns 401 when identity headers are missing or invalid', async () => {
    const service: AgentInvocationService = { invoke: jest.fn() };
    const controller = new AgentController(service);
    const response = responseDouble();

    await controller.invoke(requestDouble({ query: 'Review EMP-201 onboarding status' }), response);

    expect(service.invoke).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED', code: 'AUTHENTICATION_REQUIRED' }),
    );
  });

  it('returns the structured 500 response when the service fails', async () => {
    const service: AgentInvocationService = {
      invoke: jest.fn().mockRejectedValue(new Error('database unavailable')),
    };
    const controller = new AgentController(service);
    const response = responseDouble();

    await controller.invoke(
      requestDouble(
        { query: 'Review EMP-201 onboarding status' },
        { 'x-employee-id': 'EMP-200', 'x-user-role': 'MANAGER' },
      ),
      response,
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED', code: 'INTERNAL_ERROR' }),
    );
  });
});

describe('HealthController', () => {
  it('returns healthy status', async () => {
    const controller = new HealthController(jest.fn());
    const response = responseDouble();

    controller.health({} as Request, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ status: 'ok' });
  });

  it('returns ready when the database check succeeds', async () => {
    const checkDatabase = jest.fn().mockResolvedValue(undefined);
    const controller = new HealthController(checkDatabase);
    const response = responseDouble();

    await controller.ready({} as Request, response);

    expect(checkDatabase).toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ status: 'ready' });
  });

  it('returns not_ready when the database check fails', async () => {
    const controller = new HealthController(jest.fn().mockRejectedValue(new Error('offline')));
    const response = responseDouble();

    await controller.ready({} as Request, response);

    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({ status: 'not_ready' });
  });
});
