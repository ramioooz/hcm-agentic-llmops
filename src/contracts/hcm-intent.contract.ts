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
    missingFields: z.array(z.literal('employeeId')),
  })
  .strict()
  .superRefine((intent, context) => {
    if (intent.intent === 'UNSUPPORTED') {
      const unsupportedValues = [
        ['employeeCode', intent.employeeCode],
        ['thresholdDays', intent.thresholdDays],
        ['requestedAction', intent.requestedAction],
      ] as const;

      for (const [field, value] of unsupportedValues) {
        if (value !== null) {
          context.addIssue({
            code: 'custom',
            path: [field],
            message: `${field} must be null for UNSUPPORTED intent`,
          });
        }
      }

      if (intent.missingFields.length !== 0) {
        context.addIssue({
          code: 'custom',
          path: ['missingFields'],
          message: 'missingFields must be empty for UNSUPPORTED intent',
        });
      }

      return;
    }

    if (intent.thresholdDays === null) {
      context.addIssue({
        code: 'custom',
        path: ['thresholdDays'],
        message: 'thresholdDays must be numeric for ONBOARDING_REVIEW intent',
      });
    }

    if (intent.requestedAction === null) {
      context.addIssue({
        code: 'custom',
        path: ['requestedAction'],
        message: 'requestedAction must be explicit for ONBOARDING_REVIEW intent',
      });
    }

    const hasEmployeeIdMarker =
      intent.missingFields.length === 1 && intent.missingFields[0] === 'employeeId';

    if (intent.employeeCode === null && !hasEmployeeIdMarker) {
      context.addIssue({
        code: 'custom',
        path: ['missingFields'],
        message: 'missingFields must contain employeeId when employeeCode is null',
      });
    }

    if (intent.employeeCode !== null && intent.missingFields.length !== 0) {
      context.addIssue({
        code: 'custom',
        path: ['missingFields'],
        message: 'missingFields must be empty when employeeCode is present',
      });
    }
  });
