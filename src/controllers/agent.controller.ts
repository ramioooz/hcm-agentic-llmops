import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { parseAgentInvokeRequest } from '../contracts/agent-invoke';
import type { AccessRole } from '../types/access-role';
import type { AgentInvoker } from '../types/agent-invoker';
import type { HttpController } from './http-controller';

export class AgentController implements HttpController {
  public readonly basePath = '/api/v1/agent';
  public readonly router = Router();

  public constructor(private readonly agent?: AgentInvoker) {
    this.router.post('/invoke', this.handleInvoke);
  }

  public readonly handleInvoke = async (request: Request, response: Response): Promise<void> => {
    const correlationId = request.header('X-Correlation-Id')?.trim() || randomUUID();

    if (!this.agent) {
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
      response.status(401).json({
        status: 'FAILED',
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Provide a valid X-Employee-Id and X-User-Role header.',
        correlationId,
      });
      return;
    }

    try {
      const result = await this.agent.invoke({
        query: body.query,
        actorEmployeeCode,
        actorRole: actorRoleHeader as AccessRole,
        correlationId,
      });
      response.status(result.httpStatus).json(result.body);
    } catch {
      response.status(500).json({
        status: 'FAILED',
        code: 'INTERNAL_ERROR',
        message: 'The workflow could not be completed.',
        correlationId,
      });
    }
  };
}
