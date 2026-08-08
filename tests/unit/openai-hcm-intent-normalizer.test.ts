import type { BaseMessage, BaseMessageLike } from '@langchain/core/messages';
import { hcmIntentSchema } from '../../src/contracts/hcm-intent.contract';
import { OpenAiHcmIntentNormalizer } from '../../src/services/openai-hcm-intent-normalizer.service';
import type { StructuredOutputClient } from '../../src/types/structured-output-client';

type ModelCapture = {
  input?: BaseMessageLike[];
  options?: { name: string; strict: boolean };
  schema?: unknown;
};

function fakeClient(output: unknown, capture: ModelCapture = {}): StructuredOutputClient {
  return {
    withStructuredOutput: (schema, options) => {
      capture.schema = schema;
      capture.options = options;
      return {
        invoke: (input) => {
          capture.input = input;
          return Promise.resolve(output);
        },
      };
    },
  };
}

describe('OpenAiHcmIntentNormalizer', () => {
  it('returns the structured onboarding intent from the model output', async () => {
    const capture: ModelCapture = {};
    const normalizer = new OpenAiHcmIntentNormalizer({
      apiKey: 'unit-test-key',
      model: 'gpt-5.4-mini',
      client: fakeClient(
        {
          intent: 'ONBOARDING_REVIEW',
          employeeCode: 'EMP-201',
          thresholdDays: 14,
          requestedAction: 'NOTIFY_MANAGER',
          missingFields: [],
        },
        capture,
      ),
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
    expect(capture.schema).toBe(hcmIntentSchema);
    expect(capture.options).toEqual({ name: 'normalize_hcm_intent', strict: true });
    expect((capture.input as BaseMessage[]).at(-1)).toMatchObject({
      content: 'Please notify the manager about EMP-201 in 14 days.',
    });
  });

  it('rejects a model response that contains fields outside the strict intent schema', async () => {
    const normalizer = new OpenAiHcmIntentNormalizer({
      apiKey: 'unit-test-key',
      model: 'gpt-5.4-mini',
      client: fakeClient({
        intent: 'ONBOARDING_REVIEW',
        employeeCode: 'EMP-201',
        thresholdDays: 30,
        requestedAction: 'REVIEW_ONLY',
        missingFields: [],
        explanation: 'untrusted extra content',
      }),
    });

    await expect(normalizer.normalize('Review EMP-201 onboarding status.')).rejects.toThrow();
  });

  it.each([
    {
      description: 'unsupported intent with an employee',
      output: {
        intent: 'UNSUPPORTED',
        employeeCode: 'EMP-201',
        thresholdDays: null,
        requestedAction: null,
        missingFields: [],
      },
    },
    {
      description: 'unsupported intent with a threshold',
      output: {
        intent: 'UNSUPPORTED',
        employeeCode: null,
        thresholdDays: 30,
        requestedAction: null,
        missingFields: [],
      },
    },
    {
      description: 'unsupported intent with a notification action',
      output: {
        intent: 'UNSUPPORTED',
        employeeCode: null,
        thresholdDays: null,
        requestedAction: 'NOTIFY_MANAGER',
        missingFields: [],
      },
    },
    {
      description: 'unsupported intent with missing fields',
      output: {
        intent: 'UNSUPPORTED',
        employeeCode: null,
        thresholdDays: null,
        requestedAction: null,
        missingFields: ['employeeId'],
      },
    },
    {
      description: 'onboarding intent without a threshold',
      output: {
        intent: 'ONBOARDING_REVIEW',
        employeeCode: 'EMP-201',
        thresholdDays: null,
        requestedAction: 'REVIEW_ONLY',
        missingFields: [],
      },
    },
    {
      description: 'onboarding intent without an explicit action',
      output: {
        intent: 'ONBOARDING_REVIEW',
        employeeCode: 'EMP-201',
        thresholdDays: 30,
        requestedAction: null,
        missingFields: [],
      },
    },
    {
      description: 'missing employee without the employeeId marker',
      output: {
        intent: 'ONBOARDING_REVIEW',
        employeeCode: null,
        thresholdDays: 30,
        requestedAction: 'REVIEW_ONLY',
        missingFields: [],
      },
    },
    {
      description: 'present employee with an employeeId marker',
      output: {
        intent: 'ONBOARDING_REVIEW',
        employeeCode: 'EMP-201',
        thresholdDays: 30,
        requestedAction: 'REVIEW_ONLY',
        missingFields: ['employeeId'],
      },
    },
  ])('rejects $description', async ({ output }) => {
    const normalizer = new OpenAiHcmIntentNormalizer({
      apiKey: 'unit-test-key',
      model: 'gpt-5.4-mini',
      client: fakeClient(output),
    });

    await expect(normalizer.normalize('Normalize this request.')).rejects.toThrow();
  });
});
