import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { parseAgentInvokeRequest } from '../contracts/agent-invoke';
import type { AccessRole } from '../security/authorization';
import type {
  OnboardingInvocationInput,
  OnboardingInvocationResult,
} from '../services/onboarding-agent.service';
import type { HttpController } from './http-controller';

export type AgentInvocationService = {
  invoke(input: OnboardingInvocationInput): Promise<OnboardingInvocationResult>;
};

export class AgentController implements HttpController {
  public readonly basePath = '/api/v1/agent';
  public readonly router = Router();

  public constructor(private readonly agentService: AgentInvocationService) {
    this.router.post('/invoke', this.invoke);
  }

  public invoke = async (request: Request, response: Response): Promise<void> => {
    const correlationId = request.header('X-Correlation-Id')?.trim() || randomUUID();

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
      const result = await this.agentService.invoke({
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
