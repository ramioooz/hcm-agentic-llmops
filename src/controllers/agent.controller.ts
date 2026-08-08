import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { parseAgentInvokeRequest } from '../contracts/agent-invoke';
import { logAgentInvocationResult } from '../observability/agent-invocation-logging';
import type { AccessRole } from '../types/access-role';
import type { AgentInvoker } from '../types/agent-invoker';
import type { ApplicationLogger } from '../types/application-logger';
import type { HttpController } from './http-controller';

export class AgentController implements HttpController {
  public readonly basePath = '/api/v1/agent';
  public readonly router = Router();

  public constructor(
    private readonly dependencies: { agent?: AgentInvoker; logger: ApplicationLogger },
  ) {
    this.router.post('/invoke', this.handleInvoke);
  }

  public readonly handleInvoke = async (request: Request, response: Response): Promise<void> => {
    const correlationId = request.header('X-Correlation-Id')?.trim() || randomUUID();
    this.dependencies.logger.info({
      event: 'agent.invoke.started',
      correlationId,
    });

    if (!this.dependencies.agent) {
      this.dependencies.logger.error({
        event: 'agent.invoke.rejected',
        correlationId,
        status: 'FAILED',
        code: 'AGENT_NOT_CONFIGURED',
        httpStatus: 503,
      });
      response.status(503).json({
        status: 'FAILED',
        code: 'AGENT_NOT_CONFIGURED',
        message: 'The agent service is not configured.',
        correlationId,
      });
      return;
    }

    let body: ReturnType<typeof parseAgentInvokeRequest>;
    try {
      body = parseAgentInvokeRequest(request.body);
    } catch (error) {
      this.dependencies.logger.warn({
        event: 'agent.invoke.rejected',
        correlationId,
        status: 'FAILED',
        code: 'VALIDATION_ERROR',
        httpStatus: 400,
      });
      response.status(400).json({
        status: 'FAILED',
        code: 'VALIDATION_ERROR',
        message: error instanceof Error ? error.message : 'Invalid request body.',
        correlationId,
      });
      return;
    }

    const actorEmployeeCode = request.header('X-Employee-Id')?.trim();
    const actorRoleHeader = request.header('X-User-Role')?.trim().toUpperCase();
    const validRoles: AccessRole[] = ['HR', 'MANAGER', 'EMPLOYEE'];

    if (
      !actorEmployeeCode ||
      !actorRoleHeader ||
      !validRoles.includes(actorRoleHeader as AccessRole)
    ) {
      this.dependencies.logger.warn({
        event: 'agent.invoke.rejected',
        correlationId,
        status: 'FAILED',
        code: 'AUTHENTICATION_REQUIRED',
        httpStatus: 401,
      });
      response.status(401).json({
        status: 'FAILED',
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Provide a valid X-Employee-Id and X-User-Role header.',
        correlationId,
      });
      return;
    }

    try {
      const result = await this.dependencies.agent.invoke({
        query: body.query,
        actorEmployeeCode,
        actorRole: actorRoleHeader as AccessRole,
        correlationId,
      });
      logAgentInvocationResult(
        this.dependencies.logger,
        result.httpStatus,
        result.body,
        correlationId,
      );
      response.status(result.httpStatus).json(result.body);
    } catch {
      this.dependencies.logger.error({
        event: 'agent.invoke.failed',
        correlationId,
        status: 'FAILED',
        code: 'INTERNAL_ERROR',
        httpStatus: 500,
      });
      response.status(500).json({
        status: 'FAILED',
        code: 'INTERNAL_ERROR',
        message: 'The workflow could not be completed.',
        correlationId,
      });
    }
  };
}
