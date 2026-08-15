import type { HcmIntentType } from '../enums/hcm-agent.enum';

export type UserOnboardingCommand = {
  kind?: 'USER_QUERY';
  query: string;
  actorEmployeeCode: string;
  correlationId: string;
  triggerType?: 'HTTP';
  threadId?: string;
  runId?: string;
};

export type TechnicalOnboardingCommand = {
  kind: HcmIntentType.OnboardingReview;
  targetEmployeeCode: string;
  thresholdDays: number;
  notificationPolicy: 'NONE' | 'EXPLICIT_REQUEST' | 'SYSTEM_POLICY';
  actorEmployeeCode: string;
  correlationId: string;
  triggerType: 'SCHEDULE' | 'WEBHOOK' | 'RABBITMQ';
  eventId: string;
  threadId?: string;
  runId?: string;
};

export type OnboardingInvocationInput = UserOnboardingCommand | TechnicalOnboardingCommand;
