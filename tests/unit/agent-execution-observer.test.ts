import { HcmIntentType } from '../../src/enums/hcm-agent.enum';
import { AgentExecutionObserver } from '../../src/observability/agent-execution-observer';

describe('AgentExecutionObserver', () => {
  it('collects workflow events and records one invocation trace', async () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const forwarded = jest.fn();
    const observer = new AgentExecutionObserver({
      recorder: { record },
      configuredModel: 'gpt-5.4-mini',
      promptVersion: 'hcm-intent-v3',
      startedAt: 1_000,
      now: () => 1_125,
      input: {
        kind: 'USER_QUERY',
        query: 'Review EMP-201 onboarding status',
        actorEmployeeCode: 'EMP-200',
        correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
        threadId: '8b8a6d62-bf1c-4abf-9968-84b8e23b58cb',
      },
      runId: 'b4b012a7-740a-49c0-9ca5-f83485db7b86',
      forward: forwarded,
    });

    observer.emit({
      event: 'intent',
      data: {
        runId: 'b4b012a7-740a-49c0-9ca5-f83485db7b86',
        status: 'normalized',
        intent: HcmIntentType.OnboardingReview,
        requestedAction: null,
      },
    });
    observer.emit({
      event: 'node',
      data: {
        runId: 'b4b012a7-740a-49c0-9ca5-f83485db7b86',
        node: 'intent_normalization',
        status: 'completed',
        outcomeCode: 'INTENT_NORMALIZED',
      },
    });
    observer.emit({
      event: 'tool',
      data: {
        runId: 'b4b012a7-740a-49c0-9ca5-f83485db7b86',
        tool: 'employee_lookup',
        status: 'completed',
        outcomeCode: 'EMPLOYEE_FOUND',
      },
    });
    await observer.complete({
      result: {
        httpStatus: 200,
        body: {
          status: 'COMPLETED',
          message: 'Employee onboarding review completed.',
          threadId: '8b8a6d62-bf1c-4abf-9968-84b8e23b58cb',
          runId: 'b4b012a7-740a-49c0-9ca5-f83485db7b86',
          correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
        },
      },
    });

    expect(forwarded).toHaveBeenCalledTimes(3);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        normalizedIntent: HcmIntentType.OnboardingReview,
        nodePath: ['intent_normalization', 'employee_lookup'],
        toolNames: ['employee_lookup'],
        authorizationResult: 'AUTHORIZED',
        modelCallCount: 1,
        latencyMs: 125,
      }),
    );
  });
});
