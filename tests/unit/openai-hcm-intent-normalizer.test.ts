import type { BaseMessage, BaseMessageLike } from '@langchain/core/messages';
import { hcmIntentStructuredOutputSchema } from '../../src/contracts/hcm-intent.contract';
import { OpenAiHcmIntentNormalizer } from '../../src/adapters/openai-hcm-intent-normalizer';
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
  it('returns an explicit onboarding self-reference from the model output', async () => {
    const capture: ModelCapture = {};
    const normalizer = new OpenAiHcmIntentNormalizer(
      fakeClient(
        {
          intent: 'ONBOARDING_REVIEW',
          employeeCode: null,
          thresholdDays: 30,
          requestedAction: 'REVIEW_ONLY',
          leaveStartDate: null,
          leaveEndDate: null,
          missingFields: [],
        },
        capture,
      ),
    );

    await expect(normalizer.normalize('Review my onboarding status.')).resolves.toEqual({
      intent: 'ONBOARDING_REVIEW',
      employeeCode: null,
      thresholdDays: 30,
      requestedAction: 'REVIEW_ONLY',
      missingFields: [],
    });
    expect(capture.schema).toBe(hcmIntentStructuredOutputSchema);
    expect(capture.options).toEqual({ name: 'normalize_hcm_intent', strict: true });
    expect((capture.input as BaseMessage[]).at(-1)).toMatchObject({
      content: 'Review my onboarding status.',
    });
  });

  it('rejects a model response that contains fields outside the strict intent schema', async () => {
    const normalizer = new OpenAiHcmIntentNormalizer(
      fakeClient({
        intent: 'ONBOARDING_REVIEW',
        employeeCode: 'EMP-201',
        thresholdDays: 30,
        requestedAction: 'REVIEW_ONLY',
        leaveStartDate: null,
        leaveEndDate: null,
        missingFields: [],
        explanation: 'untrusted extra content',
      }),
    );

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
        leaveStartDate: null,
        leaveEndDate: null,
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
        leaveStartDate: null,
        leaveEndDate: null,
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
        leaveStartDate: null,
        leaveEndDate: null,
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
        leaveStartDate: null,
        leaveEndDate: null,
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
        leaveStartDate: null,
        leaveEndDate: null,
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
        leaveStartDate: null,
        leaveEndDate: null,
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
        leaveStartDate: null,
        leaveEndDate: null,
        missingFields: ['employeeId'],
      },
    },
  ])('rejects $description', async ({ output }) => {
    const normalizer = new OpenAiHcmIntentNormalizer(fakeClient(output));

    await expect(normalizer.normalize('Normalize this request.')).rejects.toThrow();
  });
});
