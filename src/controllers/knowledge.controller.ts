import { extname } from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { resolveSafeCorrelationId } from '../security/correlation-id';
import {
  KnowledgeIngestionService,
  MAX_KNOWLEDGE_FILE_BYTES,
} from '../services/knowledge-ingestion.service';
import { KnowledgeQueryService } from '../services/knowledge-query.service';
import type { EmployeeReader } from '../types/employee-reader';
import type { HttpController } from './http-controller';

const querySchema = z.object({
  query: z.string().trim().min(1).max(2_000),
  limit: z.number().int().min(1).max(8).optional(),
});
const permittedUploads = new Map([
  ['.pdf', 'application/pdf'],
  ['.txt', 'text/plain'],
  ['.md', 'text/markdown'],
  ['.markdown', 'text/markdown'],
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_KNOWLEDGE_FILE_BYTES, files: 1, fields: 2, fieldSize: 1_024 },
  fileFilter: (_request, file, callback) => {
    callback(
      null,
      permittedUploads.get(extname(file.originalname).toLowerCase()) === file.mimetype,
    );
  },
}).single('file');

export class KnowledgeController implements HttpController {
  public readonly basePath = '/api/v1/knowledge';
  public readonly router = Router();

  public constructor(
    private readonly dependencies: {
      employees: EmployeeReader;
      enabled: boolean;
      ingestion?: KnowledgeIngestionService;
      queries?: KnowledgeQueryService;
    },
  ) {
    this.router.post(
      '/documents',
      this.requireEnabled,
      this.requireHr,
      this.acceptUpload,
      this.handleUpload,
    );
    this.router.post(
      '/documents/:documentId/versions',
      this.requireEnabled,
      this.requireHr,
      this.acceptUpload,
      this.handleUpload,
    );
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

  private readonly requireHr = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    await this.requireEmployee(request, response, () => {
      if (response.locals.actorEmployee.accessRole !== 'HR') {
        response.status(403).json({
          status: 'FAILED',
          code: 'HR_ROLE_REQUIRED',
          message: 'Only HR may upload knowledge documents.',
        });
        return;
      }
      next();
    });
  };

  private readonly acceptUpload = (
    request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
    upload(request, response, (error) => {
      if (!error) {
        next();
        return;
      }
      const tooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
      response.status(tooLarge ? 413 : 400).json({
        status: 'FAILED',
        code: tooLarge ? 'KNOWLEDGE_FILE_TOO_LARGE' : 'KNOWLEDGE_UPLOAD_INVALID',
        message: tooLarge
          ? 'Knowledge files must not exceed 5 MiB.'
          : 'Upload one PDF, TXT, or Markdown file.',
      });
    });
  };

  private readonly handleUpload = async (request: Request, response: Response): Promise<void> => {
    if (!request.file) {
      response.status(400).json({
        status: 'FAILED',
        code: 'KNOWLEDGE_FILE_REQUIRED',
        message: 'Upload one PDF, TXT, or Markdown file in the file field.',
      });
      return;
    }
    const documentId =
      typeof request.params.documentId === 'string' ? request.params.documentId : undefined;
    try {
      const result = await this.dependencies.ingestion!.ingest({
        documentId,
        title:
          typeof request.body.title === 'string' ? request.body.title : request.file.originalname,
        originalFileName: request.file.originalname,
        mediaType: request.file.mimetype,
        buffer: request.file.buffer,
        createdByEmployeeCode: response.locals.actorEmployee.employeeCode,
        correlationId: response.locals.correlationId,
      });
      response.status(documentId ? 200 : 201).json({ status: 'INDEXED', ...result });
    } catch (error) {
      request.file.buffer.fill(0);
      const errorCode = error instanceof Error ? error.message : '';
      const notFound = errorCode === 'KNOWLEDGE_DOCUMENT_NOT_FOUND';
      const unsafe = errorCode === 'KNOWLEDGE_DOCUMENT_UNSAFE';
      response.status(notFound ? 404 : 400).json({
        status: 'FAILED',
        code: notFound
          ? 'KNOWLEDGE_DOCUMENT_NOT_FOUND'
          : unsafe
            ? 'KNOWLEDGE_DOCUMENT_UNSAFE'
            : 'KNOWLEDGE_UPLOAD_REJECTED',
        message: notFound
          ? 'The knowledge document was not found.'
          : unsafe
            ? 'The knowledge document contains unsafe instructions and was not indexed.'
            : 'The knowledge file could not be safely indexed.',
      });
    }
  };

  private readonly handleQuery = async (request: Request, response: Response): Promise<void> => {
    const parsed = querySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        status: 'FAILED',
        code: 'KNOWLEDGE_QUERY_INVALID',
        message: 'Provide a query of at most 2,000 characters and an optional limit from 1 to 8.',
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
          },
        }),
      );
    } catch (error) {
      const unsafe = error instanceof Error && error.message === 'UNSAFE_KNOWLEDGE_QUERY';
      response.status(unsafe ? 403 : 500).json({
        status: 'FAILED',
        code: unsafe ? 'UNSAFE_KNOWLEDGE_QUERY' : 'KNOWLEDGE_QUERY_FAILED',
        message: unsafe
          ? 'The knowledge query contains unsafe instructions and was rejected.'
          : 'The knowledge query could not be completed.',
      });
    }
  };
}
