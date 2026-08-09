import { randomUUID } from 'node:crypto';
import { MemorySaver, type BaseCheckpointSaver } from '@langchain/langgraph';
import { resolveSafeCorrelationId } from '../security/correlation-id';
import { resolveThreadId } from '../security/thread-id';
import type { AgentInvoker } from '../types/agent-invoker';
import type { AgentProgressEvent } from '../types/agent-progress-event';
import type { OnboardingInvocationInput } from '../types/onboarding-invocation-input';
import type { OnboardingInvocationResult } from '../types/onboarding-invocation-result';
import {
  runOnboardingGraph,
  type OnboardingGraphDependencies,
} from '../workflows/onboarding/onboarding.graph';

export class OnboardingAgentService implements AgentInvoker {
  private readonly dependencies: OnboardingGraphDependencies;

  public constructor(
    dependencies: Omit<OnboardingGraphDependencies, 'checkpointer'> & {
      checkpointer?: BaseCheckpointSaver;
    },
  ) {
    this.dependencies = {
      ...dependencies,
      checkpointer: dependencies.checkpointer ?? new MemorySaver(),
    };
  }

  public invoke(input: OnboardingInvocationInput): Promise<OnboardingInvocationResult> {
    const identifiers = this.resolveIdentifiers(input);
    return runOnboardingGraph(this.dependencies, { ...input, ...identifiers }, identifiers.runId);
  }

  public async *stream(input: OnboardingInvocationInput): AsyncIterable<AgentProgressEvent> {
    const events: AgentProgressEvent[] = [];
    let wake: (() => void) | undefined;
    let complete = false;
    let failure: unknown;
    const identifiers = this.resolveIdentifiers(input);
    const execution = runOnboardingGraph(
      this.dependencies,
      { ...input, ...identifiers },
      identifiers.runId,
      (event) => {
        events.push(event);
        wake?.();
        wake = undefined;
      },
    )
      .catch((error: unknown) => {
        failure = error;
      })
      .finally(() => {
        complete = true;
        wake?.();
      });

    while (!complete || events.length > 0) {
      if (events.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        continue;
      }
      const event = events.shift();
      if (event) yield event;
    }
    await execution;
    if (failure) throw failure;
  }

  private resolveIdentifiers(input: OnboardingInvocationInput): {
    correlationId: string;
    runId: string;
    threadId: string;
  } {
    return {
      correlationId: resolveSafeCorrelationId(input.correlationId),
      runId: input.runId ?? randomUUID(),
      threadId: resolveThreadId(input.threadId),
    };
  }
}
