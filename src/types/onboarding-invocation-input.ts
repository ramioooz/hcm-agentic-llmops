import type { AccessRole } from './access-role';

export type OnboardingInvocationInput = {
  query: string;
  actorEmployeeCode: string;
  actorRole: AccessRole;
  correlationId: string;
};
