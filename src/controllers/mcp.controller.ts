import { Router, type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createReadOnlyMcpServer } from '../mcp/read-only-mcp.server';
import { resolveSafeCorrelationId } from '../security/correlation-id';
import type { KnowledgeQueryService } from '../services/knowledge-query.service';
import type { ApplicationLogger } from '../types/application-logger';
import type { Clock } from '../types/clock';
import type { EmployeeReader } from '../types/employee-reader';
import type { HttpController } from './http-controller';

function jsonRpcError(response: Response, status: number, code: number, message: string): void {
  response.status(status).json({
    jsonrpc: '2.0',
    error: { code, message },
    id: null,
  });
}

export class McpController implements HttpController {
  public readonly basePath = '/mcp';
  public readonly router = Router();

  public constructor(
    private readonly dependencies: {
      employees: EmployeeReader;
      clock: Clock;
      knowledgeQueries?: Pick<KnowledgeQueryService, 'query'>;
      logger: ApplicationLogger;
    },
  ) {
    this.router.post('/', this.handlePost);
    this.router.get('/', this.handleUnsupportedMethod);
    this.router.delete('/', this.handleUnsupportedMethod);
  }

  private readonly handleUnsupportedMethod = (_request: Request, response: Response): void => {
    response.setHeader('Allow', 'POST');
    jsonRpcError(response, 405, -32_001, 'Only stateless MCP POST requests are supported.');
  };

  private readonly handlePost = async (request: Request, response: Response): Promise<void> => {
    const correlationId = resolveSafeCorrelationId(request.header('X-Correlation-Id'));
    response.setHeader('X-Correlation-Id', correlationId);
    const actorEmployeeCode = request.header('X-Employee-Id')?.trim().toUpperCase();
    if (!actorEmployeeCode || !/^EMP-\d+$/.test(actorEmployeeCode)) {
      this.dependencies.logger.warn({
        event: 'mcp.request.rejected',
        correlationId,
        status: 'FAILED',
        code: 'AUTHENTICATION_REQUIRED',
        httpStatus: 401,
      });
      jsonRpcError(response, 401, -32_001, 'A valid employee identity is required.');
      return;
    }
    let actor: Awaited<ReturnType<EmployeeReader['findByEmployeeCode']>>;
    try {
      actor = await this.dependencies.employees.findByEmployeeCode(actorEmployeeCode);
    } catch {
      this.dependencies.logger.error({
        event: 'mcp.request.failed',
        correlationId,
        status: 'FAILED',
        code: 'MCP_AUTHORIZATION_UNAVAILABLE',
        httpStatus: 500,
      });
      jsonRpcError(response, 500, -32_603, 'The MCP request could not be completed.');
      return;
    }
    if (!actor) {
      this.dependencies.logger.warn({
        event: 'mcp.request.rejected',
        correlationId,
        status: 'FAILED',
        code: 'AUTHENTICATION_REQUIRED',
        httpStatus: 401,
      });
      jsonRpcError(response, 401, -32_001, 'A valid employee identity is required.');
      return;
    }

    this.dependencies.logger.info({ event: 'mcp.request.started', correlationId });
    const server = createReadOnlyMcpServer({
      actorEmployeeCode: actor.employeeCode,
      correlationId,
      employees: this.dependencies.employees,
      clock: this.dependencies.clock,
      knowledgeQueries: this.dependencies.knowledgeQueries,
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
      this.dependencies.logger.info({
        event: 'mcp.request.completed',
        correlationId,
        status: 'COMPLETED',
        httpStatus: response.statusCode,
      });
    } catch {
      this.dependencies.logger.error({
        event: 'mcp.request.failed',
        correlationId,
        status: 'FAILED',
        code: 'MCP_REQUEST_FAILED',
        httpStatus: 500,
      });
      if (!response.headersSent) {
        jsonRpcError(response, 500, -32_603, 'The MCP request could not be completed.');
      }
    } finally {
      await server.close().catch(() => undefined);
    }
  };
}
