import type { AccessRole } from './access-role';

export type AuthorizationRequest = {
  actorRole: AccessRole;
  actorEmployeeId: string;
  targetEmployeeId: string;
  targetManagerEmployeeId?: string | null;
};
