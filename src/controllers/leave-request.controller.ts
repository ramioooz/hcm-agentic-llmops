import { Router, type Request, type Response } from 'express';
import { CommonErrorCode } from '../enums/error.enum';
import { resolveApplicationErrorCode } from '../helpers/application-error.helpers';
import { resolveSafeCorrelationId } from '../security/correlation-id';
import type { ApplicationLogger } from '../types/application-logger';
import type { LeaveDocumentProvider } from '../types/leave-document-provider';
import type { HttpController } from './http-controller';

export class LeaveRequestController implements HttpController {
  public readonly basePath = '/api/v1/leave-requests';
  public readonly router = Router();

  public constructor(
    private readonly dependencies: {
      documents: LeaveDocumentProvider;
      logger: ApplicationLogger;
    },
  ) {
    this.router.get('/:leaveRequestId/document', this.handleDocument);
  }

  public readonly handleDocument = async (request: Request, response: Response): Promise<void> => {
    const correlationId = resolveSafeCorrelationId(request.header('X-Correlation-Id'));
    response.setHeader('Cache-Control', 'no-store');
    const actorEmployeeCode = request.header('X-Employee-Id')?.trim();
    if (!actorEmployeeCode || !/^EMP-\d+$/.test(actorEmployeeCode)) {
      response.status(401).json({
        status: 'FAILED',
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Provide a valid X-Employee-Id header.',
        correlationId,
      });
      return;
    }
    try {
      const document = await this.dependencies.documents.generateAuthorized({
        leaveRequestId: request.params.leaveRequestId as string,
        actorEmployeeCode,
      });
      if (!document) {
        this.dependencies.logger.warn({
          event: 'leave.document.rejected',
          correlationId,
          status: 'FAILED',
          code: 'LEAVE_DOCUMENT_NOT_FOUND',
          httpStatus: 404,
        });
        response.status(404).json({
          status: 'FAILED',
          code: 'LEAVE_DOCUMENT_NOT_FOUND',
          message: 'The leave request document was not found.',
          correlationId,
        });
        return;
      }
      this.dependencies.logger.info({
        event: 'leave.document.served',
        correlationId,
        status: 'COMPLETED',
        httpStatus: 200,
      });
      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader(
        'Content-Disposition',
        `inline; filename="leave-request-${document.id}.pdf"`,
      );
      response.status(200).send(document.pdf);
    } catch (error) {
      const code = resolveApplicationErrorCode(error, CommonErrorCode.InternalError);
      const httpStatus =
        code === CommonErrorCode.AuthenticationRequired
          ? 401
          : code === CommonErrorCode.AuthorizationDenied
            ? 403
            : code === CommonErrorCode.EmployeeInactive
              ? 409
              : 500;
      const rejected = httpStatus < 500;
      this.dependencies.logger[rejected ? 'warn' : 'error']({
        event: rejected ? 'leave.document.rejected' : 'leave.document.failed',
        correlationId,
        status: 'FAILED',
        code: rejected ? code : CommonErrorCode.InternalError,
        httpStatus,
      });
      response.status(httpStatus).json({
        status: 'FAILED',
        code: rejected ? code : CommonErrorCode.InternalError,
        message:
          code === CommonErrorCode.AuthenticationRequired
            ? 'Identity was not found.'
            : code === CommonErrorCode.AuthorizationDenied
              ? 'You are not authorized to access this document.'
              : code === CommonErrorCode.EmployeeInactive
                ? 'The employee is not active.'
                : 'The document could not be retrieved.',
        correlationId,
      });
    }
  };
}
