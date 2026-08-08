import type { AuthorizationRequest } from '../types/authorization-request';

export function assertEmployeeReadAccess(request: AuthorizationRequest): void {
  const canRead =
    request.actorRole === 'HR' ||
    request.actorEmployeeId === request.targetEmployeeId ||
    (request.actorRole === 'MANAGER' &&
      request.targetManagerEmployeeId === request.actorEmployeeId);

  if (!canRead) {
    throw new Error('AUTHORIZATION_DENIED');
  }
}
