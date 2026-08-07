import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import { parseAgentInvokeRequest } from './contracts/agent-invoke';
import type { AccessRole } from './security/authorization';
import type {
  OnboardingInvocationInput,
  OnboardingInvocationResult,
} from './services/onboarding-agent.service';

export type AppDependencies = {
  checkDatabase?: () => Promise<void>;
  invokeAgent?: (input: OnboardingInvocationInput) => Promise<OnboardingInvocationResult>;
};

export function createApp(dependencies: AppDependencies = {}): Express {
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  app.get('/ready', async (_request, response) => {
    try {
      await dependencies.checkDatabase?.();
      response.status(200).json({ status: 'ready' });
    } catch {
      response.status(503).json({ status: 'not_ready' });
    }
  });

  app.post('/api/v1/agent/invoke', async (request, response) => {
    const correlationId = request.header('X-Correlation-Id')?.trim() || randomUUID();

    if (!dependencies.invokeAgent) {
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
      const result = await dependencies.invokeAgent({
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
  });

  return app;
}
