import { z } from 'zod';
import { ONBOARDING_REVIEW_ACTION_VALUES } from '../enums/onboarding.enum';

const employeeCode = z
  .string()
  .regex(/^EMP-\d+$/)
  .nullable();
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

export const hcmIntentStructuredOutputSchema = z
  .object({
    intent: z.enum(['ONBOARDING_REVIEW', 'LEAVE_REQUEST', 'UNSUPPORTED']),
    employeeCode,
    thresholdDays: z.number().int().min(1).max(365).nullable(),
    requestedAction: z.enum(ONBOARDING_REVIEW_ACTION_VALUES).nullable(),
    leaveStartDate: dateOnly,
    leaveEndDate: dateOnly,
    missingFields: z.array(z.enum(['employeeId', 'startDate', 'endDate'])),
  })
  .strict();

const onboardingIntentSchema = z
  .object({
    intent: z.literal('ONBOARDING_REVIEW'),
    employeeCode,
    thresholdDays: z.number().int().min(1).max(365),
    requestedAction: z.enum(ONBOARDING_REVIEW_ACTION_VALUES),
    missingFields: z.array(z.literal('employeeId')),
  })
  .strict()
  .superRefine((intent, context) => {
    if (intent.employeeCode !== null && intent.missingFields.length !== 0) {
      context.addIssue({
        code: 'custom',
        path: ['missingFields'],
        message: 'missingFields must be empty when employeeCode is present',
      });
    }
  });

const leaveIntentSchema = z
  .object({
    intent: z.literal('LEAVE_REQUEST'),
    employeeCode,
    thresholdDays: z.null(),
    requestedAction: z.null(),
    leaveStartDate: dateOnly,
    leaveEndDate: dateOnly,
    missingFields: z.array(z.enum(['startDate', 'endDate'])),
  })
  .strict()
  .superRefine((intent, context) => {
    const expectedMissing = [
      ...(intent.leaveStartDate === null ? (['startDate'] as const) : []),
      ...(intent.leaveEndDate === null ? (['endDate'] as const) : []),
    ];
    if (
      expectedMissing.length !== intent.missingFields.length ||
      expectedMissing.some((field) => !intent.missingFields.includes(field))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['missingFields'],
        message: 'missingFields must identify each missing leave date',
      });
    }
  });

const unsupportedIntentSchema = z
  .object({
    intent: z.literal('UNSUPPORTED'),
    employeeCode: z.null(),
    thresholdDays: z.null(),
    requestedAction: z.null(),
    missingFields: z.array(z.enum(['employeeId', 'startDate', 'endDate'])).length(0),
  })
  .strict();

export const hcmIntentSchema = z.union([
  onboardingIntentSchema,
  leaveIntentSchema,
  unsupportedIntentSchema,
]);
