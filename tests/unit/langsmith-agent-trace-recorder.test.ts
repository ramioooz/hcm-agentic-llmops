import {
  LangSmithAgentTraceRecorder,
  type LangSmithRun,
} from '../../src/observability/langsmith-agent-trace-recorder';
import type { AgentTrace } from '../../src/types/agent-trace';

const safeTrace = {
  runId: '87a69b94-65d4-4a73-a11d-0e69258f772e',
  threadId: '8b8a6d62-bf1c-4abf-9968-84b8e23b58cb',
  correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
  promptVersion: 'hcm-intent-v1',
  configuredModel: 'gpt-5.4-mini',
  normalizedIntent: 'ONBOARDING_REVIEW',
  nodePath: ['request_guard', 'intent_normalization', 'employee_lookup'],
  toolNames: ['employee_lookup'],
  authorizationResult: 'AUTHORIZED',
  retryCount: 0,
  modelCallCount: 1,
  tokenUsage: null,
  latencyMs: 12,
  costUsd: null,
  failureCode: null,
  rawQuery: 'Review EMP-201 onboarding status.',
  guardrailReasonCode: null,
  blockedBeforeModel: false,
} satisfies AgentTrace;

describe('LangSmithAgentTraceRecorder', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uploads one chain run containing the approved agent trace contract', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const runs: unknown[] = [];
    const recorder = new LangSmithAgentTraceRecorder(
      {
        createRun: async (run: LangSmithRun) => {
          runs.push(run);
        },
      },
      'hcm-agentic-llmops-test',
    );

    await recorder.record(safeTrace);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toEqual({
      id: safeTrace.runId,
      name: 'hcm-agent',
      run_type: 'chain',
      project_name: 'hcm-agentic-llmops-test',
      start_time: 988,
      end_time: 1_000,
      inputs: {
        runId: safeTrace.runId,
        threadId: safeTrace.threadId,
        correlationId: safeTrace.correlationId,
        rawQuery: 'Review EMP-201 onboarding status.',
      },
      outputs: {
        normalizedIntent: 'ONBOARDING_REVIEW',
        nodePath: ['request_guard', 'intent_normalization', 'employee_lookup'],
        toolNames: ['employee_lookup'],
        authorizationResult: 'AUTHORIZED',
        retryCount: 0,
        modelCallCount: 1,
        tokenUsage: null,
        latencyMs: 12,
        costUsd: null,
        failureCode: null,
        guardrailReasonCode: null,
        blockedBeforeModel: false,
      },
      extra: {
        metadata: {
          promptVersion: 'hcm-intent-v1',
          configuredModel: 'gpt-5.4-mini',
        },
      },
    });
    const serialized = JSON.stringify(runs);
    expect(serialized).toContain('Review EMP-201 onboarding status.');
    expect(serialized).not.toContain('samira@company.com');
    expect(serialized).not.toContain('apiKey');
  });
});
