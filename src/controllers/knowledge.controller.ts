import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { KnowledgeErrorCode } from '../enums/error.enum';
import { resolveApplicationErrorCode } from '../helpers/application-error.helpers';
import { resolveSafeCorrelationId } from '../security/correlation-id';
import { KnowledgeQueryService } from '../services/knowledge-query.service';
import type { EmployeeReader } from '../types/employee-reader';
import type { HttpController } from './http-controller';

const querySchema = z
  .object({
    query: z.string().trim().min(1).max(2_000),
  })
  .strict();

export class KnowledgeController implements HttpController {
  public readonly basePath = '/api/v1/knowledge';
  public readonly router = Router();

  public constructor(
    private readonly dependencies: {
      employees: EmployeeReader;
      enabled: boolean;
      queries?: KnowledgeQueryService;
    },
  ) {
    this.router.post(
      '/documents/:documentId/query',
      this.requireEnabled,
      this.requireEmployee,
      this.handleQuery,
    );
    this.router.post('/query', this.requireEnabled, this.requireEmployee, this.handleQuery);
  }

  private readonly requireEnabled = (
    _request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
    if (!this.dependencies.enabled) {
      response.status(503).json({
        status: 'FAILED',
        code: 'RAG_EXTERNAL_PROCESSING_DISABLED',
        message: 'Knowledge processing is disabled by configuration.',
      });
      return;
    }
    next();
  };

  private readonly requireEmployee = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    const correlationId = resolveSafeCorrelationId(request.header('X-Correlation-Id'));
    response.setHeader('X-Correlation-Id', correlationId);
    response.locals.correlationId = correlationId;
    const employeeCode = request.header('X-Employee-Id')?.trim().toUpperCase();
    if (!employeeCode || !/^EMP-\d+$/.test(employeeCode)) {
      response.status(401).json({
        status: 'FAILED',
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Provide a valid X-Employee-Id header.',
      });
      return;
    }
    const employee = await this.dependencies.employees.findByEmployeeCode(employeeCode);
    if (!employee) {
      response.status(401).json({
        status: 'FAILED',
        code: 'AUTHENTICATION_REQUIRED',
        message: 'The employee identity was not found.',
      });
      return;
    }
    response.locals.actorEmployee = employee;
    next();
  };

  public readonly handleQuery = async (request: Request, response: Response): Promise<void> => {
    const parsed = querySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        status: 'FAILED',
        code: 'KNOWLEDGE_QUERY_INVALID',
        message:
          'Send only a non-empty query of at most 2,000 characters. The limit field is not supported because retrieval limits are configured by the server.',
      });
      return;
    }
    const documentId =
      typeof request.params.documentId === 'string' ? request.params.documentId : undefined;
    try {
      response.status(200).json(
        await this.dependencies.queries!.query({
          ...parsed.data,
          documentId,
          securityContext: {
            correlationId: response.locals.correlationId,
            actorEmployeeCode: response.locals.actorEmployee.employeeCode,
            requestSource: 'HTTP',
          },
        }),
      );
    } catch (error) {
      const code = resolveApplicationErrorCode(error, KnowledgeErrorCode.QueryFailed);
      if (code === KnowledgeErrorCode.DocumentNotFound) {
        response.status(404).json({
          status: 'FAILED',
          code,
          message: 'The requested knowledge document was not found or has no active index.',
        });
        return;
      }
      const unsafe = code === KnowledgeErrorCode.UnsafeQuery;
      response.status(unsafe ? 403 : 500).json({
        status: 'FAILED',
        code: unsafe ? KnowledgeErrorCode.UnsafeQuery : KnowledgeErrorCode.QueryFailed,
        message: unsafe
          ? 'The knowledge query contains unsafe instructions and was rejected.'
          : 'The knowledge query could not be completed.',
      });
    }
  };
}
