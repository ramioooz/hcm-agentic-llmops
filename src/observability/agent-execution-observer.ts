import { CommonErrorCode } from '../enums/error.enum';
import { HcmIntentType } from '../enums/hcm-agent.enum';
import type { AgentEventSink } from '../types/agent-event-sink';
import type { AgentProgressEvent } from '../types/agent-progress-event';
import type { AgentTraceRecorder } from '../types/agent-trace-recorder';
import type { OnboardingInvocationInput } from '../types/onboarding-invocation-input';
import type { OnboardingInvocationResult } from '../types/onboarding-invocation-result';
import type { RequestSafetyReasonCode } from '../types/request-safety-reason-code';

export class AgentExecutionObserver {
  private normalizedIntent: HcmIntentType | null = null;
  private readonly nodePath: string[] = [];
  private readonly toolNames: string[] = [];
  private authorizationResult: 'AUTHORIZED' | 'DENIED' | 'NOT_EVALUATED' = 'NOT_EVALUATED';

  public constructor(
    private readonly dependencies: {
      recorder?: AgentTraceRecorder;
      configuredModel: string;
      promptVersion: string;
      startedAt: number;
      now?: () => number;
      input: OnboardingInvocationInput & { threadId: string };
      runId: string;
      forward: AgentEventSink;
    },
  ) {}

  public readonly emit: AgentEventSink = (event) => {
    this.observe(event);
    this.dependencies.forward(event);
  };

  public markAuthorizationDenied(): void {
    this.authorizationResult = 'DENIED';
  }

  public recordNode(node: string): void {
    this.nodePath.push(node);
  }

  public async complete(input: {
    result: OnboardingInvocationResult;
    guardrailReasonCode?: RequestSafetyReasonCode;
  }): Promise<void> {
    if (!this.dependencies.recorder) return;
    const technicalCommand = !('query' in this.dependencies.input);
    const modelCallCount =
      !technicalCommand && this.nodePath.includes('intent_normalization') ? 1 : 0;
    const failureCode =
      input.result.body.status === 'FAILED'
        ? typeof input.result.body.code === 'string'
          ? input.result.body.code
          : CommonErrorCode.InternalError
        : null;
    try {
      await this.dependencies.recorder.record({
        runId: this.dependencies.runId,
        threadId: this.dependencies.input.threadId,
        correlationId: this.dependencies.input.correlationId,
        rawQuery: 'query' in this.dependencies.input ? this.dependencies.input.query : '',
        promptVersion: this.dependencies.promptVersion,
        configuredModel: this.dependencies.configuredModel,
        normalizedIntent: this.normalizedIntent,
        nodePath: this.nodePath,
        toolNames: this.toolNames,
        authorizationResult: this.authorizationResult,
        guardrailReasonCode: input.guardrailReasonCode ?? null,
        blockedBeforeModel: input.guardrailReasonCode !== undefined && modelCallCount === 0,
        retryCount: 0,
        modelCallCount,
        tokenUsage: null,
        latencyMs: Math.max(0, (this.dependencies.now ?? Date.now)() - this.dependencies.startedAt),
        costUsd: null,
        failureCode,
      });
    } catch {
      // Optional external tracing must never change application behavior.
    }
  }

  private observe(event: AgentProgressEvent): void {
    if (event.event === 'intent') this.normalizedIntent = event.data.intent;
    if (event.event === 'node') this.nodePath.push(event.data.node);
    if (event.event === 'approval') this.nodePath.push(`approval_${event.data.status}`);
    if (event.event === 'document') this.nodePath.push(`document_${event.data.status}`);
    if (event.event !== 'tool') return;

    this.toolNames.push(event.data.tool);
    this.nodePath.push(event.data.tool);
    if (event.data.outcomeCode === CommonErrorCode.AuthorizationDenied) {
      this.authorizationResult = 'DENIED';
      return;
    }
    if (
      (event.data.tool === 'employee_lookup' ||
        event.data.tool === 'leave_policy_lookup' ||
        event.data.tool === 'leave_balance_lookup') &&
      event.data.status === 'completed'
    ) {
      this.authorizationResult = 'AUTHORIZED';
    }
  }
}
