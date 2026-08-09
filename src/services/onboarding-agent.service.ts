import { randomUUID } from 'node:crypto';
import { resolveSafeCorrelationId } from '../security/correlation-id';
import type { AgentInvoker } from '../types/agent-invoker';
import type { AgentProgressEvent } from '../types/agent-progress-event';
import type { OnboardingInvocationInput } from '../types/onboarding-invocation-input';
import type { OnboardingInvocationResult } from '../types/onboarding-invocation-result';
import {
  runOnboardingGraph,
  type OnboardingGraphDependencies,
} from '../workflows/onboarding/onboarding.graph';

export class OnboardingAgentService implements AgentInvoker {
  public constructor(private readonly dependencies: OnboardingGraphDependencies) {}

  public invoke(input: OnboardingInvocationInput): Promise<OnboardingInvocationResult> {
    return runOnboardingGraph(
      this.dependencies,
      { ...input, correlationId: resolveSafeCorrelationId(input.correlationId) },
      randomUUID(),
    );
  }

  public async *stream(input: OnboardingInvocationInput): AsyncIterable<AgentProgressEvent> {
    const events: AgentProgressEvent[] = [];
    let wake: (() => void) | undefined;
    let complete = false;
    let failure: unknown;
    const execution = runOnboardingGraph(
      this.dependencies,
      { ...input, correlationId: resolveSafeCorrelationId(input.correlationId) },
      randomUUID(),
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
}
