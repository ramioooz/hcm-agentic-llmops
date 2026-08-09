import { Client } from 'langsmith';
import type { AgentTraceRecorder } from '../types/agent-trace-recorder';
import type { SafeAgentTrace } from '../types/safe-agent-trace';

export type LangSmithRun = {
  id: string;
  name: string;
  run_type: 'chain';
  project_name: string;
  start_time: number;
  end_time: number;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  extra: { metadata: Record<string, unknown> };
};

type LangSmithRunClient = {
  createRun(run: LangSmithRun): Promise<void>;
};

export class LangSmithAgentTraceRecorder implements AgentTraceRecorder {
  public constructor(
    private readonly client: LangSmithRunClient,
    private readonly projectName: string,
  ) {}

  public async record(trace: SafeAgentTrace): Promise<void> {
    const endTime = Date.now();
    await this.client.createRun({
      id: trace.runId,
      name: 'hcm-onboarding-agent',
      run_type: 'chain',
      project_name: this.projectName,
      start_time: endTime - trace.latencyMs,
      end_time: endTime,
      inputs: {
        runId: trace.runId,
        correlationId: trace.correlationId,
      },
      outputs: {
        normalizedIntent: trace.normalizedIntent,
        nodePath: trace.nodePath,
        toolNames: trace.toolNames,
        authorizationResult: trace.authorizationResult,
        retryCount: trace.retryCount,
        modelCallCount: trace.modelCallCount,
        tokenUsage: trace.tokenUsage,
        latencyMs: trace.latencyMs,
        costUsd: trace.costUsd,
        failureCode: trace.failureCode,
      },
      extra: {
        metadata: {
          promptVersion: trace.promptVersion,
          configuredModel: trace.configuredModel,
        },
      },
    });
  }
}

export function createLangSmithAgentTraceRecorder(input: {
  apiKey: string;
  projectName: string;
}): AgentTraceRecorder {
  return new LangSmithAgentTraceRecorder(
    new Client({
      apiKey: input.apiKey,
      autoBatchTracing: false,
      omitTracedRuntimeInfo: true,
    }),
    input.projectName,
  );
}
