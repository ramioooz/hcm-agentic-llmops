export type OnboardingInvocationInput = {
  query: string;
  actorEmployeeCode: string;
  correlationId: string;
  threadId?: string;
  runId?: string;
};
