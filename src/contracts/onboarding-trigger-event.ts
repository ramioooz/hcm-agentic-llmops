import { z } from 'zod';
import { OnboardingReviewAction } from '../enums/onboarding.enum';

const safeIdentifier = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const onboardingTriggerEventSchema = z
  .object({
    version: z.literal('1'),
    eventId: z.string().min(1).max(128).regex(safeIdentifier),
    type: z.literal('onboarding.review.requested'),
    occurredAt: z.string().datetime({ offset: true }),
    correlationId: z.string().regex(uuidV4).optional(),
    data: z
      .object({
        employeeCode: z.string().regex(/^EMP-\d+$/),
        thresholdDays: z.number().int().min(0).max(365).default(30),
        action: z.enum(OnboardingReviewAction).default(OnboardingReviewAction.ReviewOnly),
        threadId: z.string().regex(uuidV4).optional(),
      })
      .strict(),
  })
  .strict();

export type OnboardingTriggerEvent = z.infer<typeof onboardingTriggerEventSchema>;

export function parseOnboardingTriggerEvent(input: unknown): OnboardingTriggerEvent {
  return onboardingTriggerEventSchema.parse(input);
}
