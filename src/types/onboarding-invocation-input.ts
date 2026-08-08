import type { AccessRole } from '../security/authorization';

export type OnboardingInvocationInput = {
  query: string;
  actorEmployeeCode: string;
  actorRole: AccessRole;
  correlationId: string;
};
