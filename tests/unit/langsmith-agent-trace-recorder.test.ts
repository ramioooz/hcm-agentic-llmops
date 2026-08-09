import {
  LangSmithAgentTraceRecorder,
  type LangSmithRun,
} from '../../src/observability/langsmith-agent-trace-recorder';
import type { SafeAgentTrace } from '../../src/types/safe-agent-trace';

const safeTrace: SafeAgentTrace = {
  runId: '87a69b94-65d4-4a73-a11d-0e69258f772e',
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
};

describe('LangSmithAgentTraceRecorder', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uploads one chain run containing only allowlisted safe trace fields', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const runs: unknown[] = [];
    const recorder = new LangSmithAgentTraceRecorder(
      {
        createRun: async (run: LangSmithRun) => {
          runs.push(run);
        },
      },
      'hcm-agentic-api-test',
    );

    await recorder.record(safeTrace);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toEqual({
      id: safeTrace.runId,
      name: 'hcm-onboarding-agent',
      run_type: 'chain',
      project_name: 'hcm-agentic-api-test',
      start_time: 988,
      end_time: 1_000,
      inputs: {
        runId: safeTrace.runId,
        correlationId: safeTrace.correlationId,
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
      },
      extra: {
        metadata: {
          promptVersion: 'hcm-intent-v1',
          configuredModel: 'gpt-5.4-mini',
        },
      },
    });
    const serialized = JSON.stringify(runs);
    expect(serialized).not.toContain('raw query');
    expect(serialized).not.toContain('EMP-201');
    expect(serialized).not.toContain('samira@company.com');
    expect(serialized).not.toContain('apiKey');
  });
});
