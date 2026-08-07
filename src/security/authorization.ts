export type AccessRole = 'HR' | 'MANAGER' | 'EMPLOYEE';

export type AuthorizationRequest = {
  actorRole: AccessRole;
  actorEmployeeId: string;
  targetEmployeeId: string;
};

export function assertEmployeeReadAccess(request: AuthorizationRequest): void {
  const canRead =
    request.actorRole === 'HR' || request.actorEmployeeId === request.targetEmployeeId;

  if (!canRead) {
    throw new Error('AUTHORIZATION_DENIED');
  }
}
