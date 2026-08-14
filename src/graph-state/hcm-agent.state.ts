import { StateSchema, UntrackedValue } from '@langchain/langgraph';
import { z } from 'zod';
import { HcmAgentRoute, HcmIntentType } from '../enums/hcm-agent.enum';
import { OnboardingReviewAction } from '../enums/onboarding.enum';

export const HcmAgentState = new StateSchema({
  ownerBindingId: z.string().min(1),
  pendingIntent: z.literal(HcmIntentType.OnboardingReview).nullable().optional(),
  pendingThresholdDays: z.number().int().min(1).max(365).nullable().optional(),
  pendingRequestedAction: z.enum(OnboardingReviewAction).nullable().optional(),
  pendingMissingFields: z.array(z.literal('employeeId')).optional(),
  route: new UntrackedValue(z.enum(HcmAgentRoute)),
  pendingLeaveApproval: z
    .object({
      employeeId: z.string().min(1),
      policyId: z.string().min(1),
      startDate: z.string(),
      endDate: z.string(),
      requestedWorkingDays: z.number().int().min(1),
    })
    .nullable()
    .optional(),
});
