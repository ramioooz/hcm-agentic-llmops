import { z } from 'zod';

export const hcmIntentSchema = z
  .object({
    intent: z.enum(['ONBOARDING_REVIEW', 'UNSUPPORTED']),
    employeeCode: z
      .string()
      .regex(/^EMP-\d+$/)
      .nullable(),
    thresholdDays: z.number().int().min(1).max(365).nullable(),
    requestedAction: z.enum(['REVIEW_ONLY', 'NOTIFY_MANAGER']).nullable(),
    missingFields: z.array(z.enum(['employeeId'])),
  })
  .strict();
