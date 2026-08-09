import type { BaseMessage } from '@langchain/core/messages';
import {
  buildHcmIntentNormalizationMessages,
  HCM_INTENT_PROMPT_VERSION,
} from '../../src/prompts/normalize-hcm-intent.prompt';
import { buildOpenAiModelConfiguration } from '../../src/adapters/openai-hcm-intent-normalizer';

describe('HCM intent normalization configuration', () => {
  it('uses the versioned system prompt and forwards the exact query after focused examples', () => {
    const messages = buildHcmIntentNormalizationMessages(
      'Could you review employee EMP-201?',
    ) as BaseMessage[];

    expect(HCM_INTENT_PROMPT_VERSION).toBe('hcm-intent-v1');
    expect(messages.map((message) => message.getType())).toEqual([
      'system',
      'human',
      'ai',
      'human',
      'ai',
      'human',
      'ai',
      'human',
    ]);
    expect(messages[0]?.content).not.toContain('Prompt version:');
    expect(messages[0]?.content).toContain(
      'When no day threshold is stated, use 30 for ONBOARDING_REVIEW.',
    );
    expect(messages[0]?.content).toContain(
      'Use REVIEW_ONLY unless the request explicitly asks to notify or message a manager.',
    );
    expect(messages[0]?.content).toContain(
      'Use NOTIFY_MANAGER only when the request explicitly asks to notify or message a manager.',
    );
    expect(messages.slice(1, -1).map((message) => message.content)).toEqual([
      'Check onboarding status for EMP-201 within 14 days.',
      JSON.stringify({
        intent: 'ONBOARDING_REVIEW',
        employeeCode: 'EMP-201',
        thresholdDays: 14,
        requestedAction: 'REVIEW_ONLY',
        missingFields: [],
      }),
      'Notify the manager about EMP-201 probation status.',
      JSON.stringify({
        intent: 'ONBOARDING_REVIEW',
        employeeCode: 'EMP-201',
        thresholdDays: 30,
        requestedAction: 'NOTIFY_MANAGER',
        missingFields: [],
      }),
      'Review the onboarding status.',
      JSON.stringify({
        intent: 'ONBOARDING_REVIEW',
        employeeCode: null,
        thresholdDays: 30,
        requestedAction: 'REVIEW_ONLY',
        missingFields: ['employeeId'],
      }),
    ]);
    expect(messages.at(-1)?.content).toBe('Could you review employee EMP-201?');
  });

  it('builds the required provider retry and timeout settings', () => {
    expect(
      buildOpenAiModelConfiguration({ apiKey: 'unit-test-key', model: 'gpt-5.4-mini' }),
    ).toEqual({
      apiKey: 'unit-test-key',
      model: 'gpt-5.4-mini',
      maxRetries: 1,
      timeout: 15_000,
    });
  });
});
