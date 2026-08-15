import { CommonErrorCode } from '../enums/error.enum';
import { ApplicationError } from '../errors/application.error';
import type { AuthorizationRequest } from '../types/authorization-request';

export function assertEmployeeReadAccess(request: AuthorizationRequest): void {
  const canRead =
    request.actorRole === 'HR' ||
    request.actorEmployeeId === request.targetEmployeeId ||
    (request.actorRole === 'MANAGER' &&
      request.targetManagerEmployeeId === request.actorEmployeeId);

  if (!canRead) {
    throw new ApplicationError(CommonErrorCode.AuthorizationDenied);
  }
}
