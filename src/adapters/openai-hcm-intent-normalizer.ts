import { hcmIntentSchema, hcmIntentStructuredOutputSchema } from '../contracts/hcm-intent.contract';
import { buildHcmIntentNormalizationMessages } from '../prompts/normalize-hcm-intent.prompt';
import type { HcmIntent } from '../types/hcm-intent';
import type { HcmIntentNormalizer } from '../types/hcm-intent-normalizer';
import type { StructuredOutputClient } from '../types/structured-output-client';

const normalizationName = 'normalize_hcm_intent';

export function buildOpenAiModelConfiguration(input: { apiKey: string; model: 'gpt-5.4-mini' }) {
  return {
    apiKey: input.apiKey,
    model: input.model,
    maxRetries: 1,
    timeout: 15_000,
  };
}

export class OpenAiHcmIntentNormalizer implements HcmIntentNormalizer {
  private readonly structuredOutputModel: ReturnType<
    StructuredOutputClient['withStructuredOutput']
  >;

  public constructor(client: StructuredOutputClient) {
    this.structuredOutputModel = client.withStructuredOutput(hcmIntentStructuredOutputSchema, {
      name: normalizationName,
      strict: true,
    });
  }

  public async normalize(query: string): Promise<HcmIntent> {
    const output = hcmIntentStructuredOutputSchema.parse(
      await this.structuredOutputModel.invoke(buildHcmIntentNormalizationMessages(query)),
    );

    if (output.intent === 'ONBOARDING_REVIEW') {
      return hcmIntentSchema.parse({
        intent: output.intent,
        employeeCode: output.employeeCode,
        thresholdDays: output.thresholdDays,
        requestedAction: output.requestedAction,
        missingFields: output.missingFields,
      });
    }

    if (output.intent === 'LEAVE_REQUEST') {
      return hcmIntentSchema.parse({
        intent: output.intent,
        employeeCode: output.employeeCode,
        thresholdDays: output.thresholdDays,
        requestedAction: output.requestedAction,
        leaveStartDate: output.leaveStartDate,
        leaveEndDate: output.leaveEndDate,
        missingFields: output.missingFields,
      });
    }

    return hcmIntentSchema.parse({
      intent: output.intent,
      employeeCode: output.employeeCode,
      thresholdDays: output.thresholdDays,
      requestedAction: output.requestedAction,
      missingFields: output.missingFields,
    });
  }
}
