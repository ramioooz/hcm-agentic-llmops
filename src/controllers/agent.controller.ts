import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { parseAgentInvokeRequest } from '../contracts/agent-invoke';
import { logAgentInvocationResult } from '../observability/agent-invocation-logging';
import { resolveSafeCorrelationId } from '../security/correlation-id';
import { InvalidThreadIdError, resolveThreadId } from '../security/thread-id';
import type { AgentInvoker } from '../types/agent-invoker';
import type { ApplicationLogger } from '../types/application-logger';
import type { InvocationBody } from '../types/invocation-body';
import type { OnboardingInvocationInput } from '../types/onboarding-invocation-input';
import type { HttpController } from './http-controller';

export class AgentController implements HttpController {
  public readonly basePath = '/api/v1/agent';
  public readonly router = Router();

  public constructor(
    private readonly dependencies: { agent: AgentInvoker; logger: ApplicationLogger },
  ) {
    this.router.post('/invoke', this.handleInvoke);
  }

  public readonly handleInvoke = async (request: Request, response: Response): Promise<void> => {
    const suppliedCorrelationId = request.header('X-Correlation-Id');

    let threadId: string;
    try {
      threadId = resolveThreadId(request.header('X-Thread-Id'));
    } catch (error) {
      const correlationId = resolveSafeCorrelationId(suppliedCorrelationId);
      const runId = resolveSafeCorrelationId(undefined, [correlationId]);
      const message =
        error instanceof InvalidThreadIdError ? error.message : 'X-Thread-Id must be a UUID v4.';
      this.dependencies.logger.warn({
        event: 'agent.invoke.rejected',
        correlationId,
        status: 'FAILED',
        code: 'INVALID_THREAD_ID',
        httpStatus: 400,
      });
      response.status(400).json({
        status: 'FAILED',
        code: 'INVALID_THREAD_ID',
        message,
        runId,
        correlationId,
      });
      return;
    }
    const correlationId = resolveSafeCorrelationId(suppliedCorrelationId, [threadId]);
    const runId = resolveSafeCorrelationId(undefined, [threadId, correlationId]);
    this.dependencies.logger.info({
      event: 'agent.invoke.started',
      correlationId,
    });
    response.setHeader('X-Thread-Id', threadId);

    const actorEmployeeCode = request.header('X-Employee-Id')?.trim();

    if (!actorEmployeeCode || !/^EMP-\d+$/.test(actorEmployeeCode)) {
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
        message: 'Provide a valid X-Employee-Id header.',
        threadId,
        runId,
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
        threadId,
        runId,
        correlationId,
      });
      return;
    }

    const input = {
      kind: 'USER_QUERY' as const,
      query: body.query,
      actorEmployeeCode,
      threadId,
      runId,
      correlationId,
      triggerType: 'HTTP' as const,
    };
    if (request.header('Accept')?.toLowerCase().includes('text/event-stream')) {
      await this.writeEventStream(input, response);
      return;
    }

    try {
      const result = await this.dependencies.agent.invoke(input);
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
        threadId,
        runId,
        correlationId,
      });
    }
  };

  private async writeEventStream(
    input: OnboardingInvocationInput,
    response: Response,
  ): Promise<void> {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders?.();
    let runId: string = input.runId ?? randomUUID();

    try {
      let finalResponse: { httpStatus: number; body: InvocationBody } | undefined;
      for await (const event of this.dependencies.agent.stream(input)) {
        if (event.event === 'run') runId = event.data.runId;
        response.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
        if (event.event === 'response') finalResponse = event.data;
      }
      if (finalResponse) {
        logAgentInvocationResult(
          this.dependencies.logger,
          finalResponse.httpStatus,
          finalResponse.body,
          input.correlationId,
        );
      }
    } catch {
      const body: InvocationBody = {
        status: 'FAILED',
        code: 'INTERNAL_ERROR',
        message: 'The workflow could not be completed.',
        threadId: input.threadId as string,
        runId,
        correlationId: input.correlationId,
      };
      logAgentInvocationResult(this.dependencies.logger, 500, body, input.correlationId);
      response.write(
        `event: response\ndata: ${JSON.stringify({
          runId,
          status: 'completed',
          httpStatus: 500,
          body,
        })}\n\n`,
      );
    } finally {
      response.end();
    }
  }
}
