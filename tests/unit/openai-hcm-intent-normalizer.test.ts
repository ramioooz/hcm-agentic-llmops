import { OpenAiHcmIntentNormalizer } from '../../src/services/openai-hcm-intent-normalizer.service';
import type { StructuredOutputClient } from '../../src/types/structured-output-client';

function fakeClient(output: unknown): StructuredOutputClient {
  return {
    withStructuredOutput: () => ({ invoke: jest.fn().mockResolvedValue(output) }),
  };
}

describe('OpenAiHcmIntentNormalizer', () => {
  it('returns the structured onboarding intent from the model output', async () => {
    const normalizer = new OpenAiHcmIntentNormalizer({
      apiKey: 'unit-test-key',
      model: 'gpt-5.4-mini',
      client: fakeClient({
        intent: 'ONBOARDING_REVIEW',
        employeeCode: 'EMP-201',
        thresholdDays: 14,
        requestedAction: 'NOTIFY_MANAGER',
        missingFields: [],
      }),
    });

    await expect(
      normalizer.normalize('Please notify the manager about EMP-201 in 14 days.'),
    ).resolves.toEqual({
      intent: 'ONBOARDING_REVIEW',
      employeeCode: 'EMP-201',
      thresholdDays: 14,
      requestedAction: 'NOTIFY_MANAGER',
      missingFields: [],
    });
  });

  it('rejects a model response that contains fields outside the strict intent schema', async () => {
    const normalizer = new OpenAiHcmIntentNormalizer({
      apiKey: 'unit-test-key',
      model: 'gpt-5.4-mini',
      client: fakeClient({
        intent: 'ONBOARDING_REVIEW',
        employeeCode: 'EMP-201',
        thresholdDays: null,
        requestedAction: null,
        missingFields: [],
        explanation: 'untrusted extra content',
      }),
    });

    await expect(normalizer.normalize('Review EMP-201 onboarding status.')).rejects.toThrow();
  });
});
