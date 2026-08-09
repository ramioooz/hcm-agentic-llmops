import { randomUUID } from 'node:crypto';
import { MemorySaver, type BaseCheckpointSaver } from '@langchain/langgraph';
import { resolveSafeCorrelationId } from '../security/correlation-id';
import { resolveThreadId } from '../security/thread-id';
import type { AgentInvoker } from '../types/agent-invoker';
import type { AgentResumeInput } from '../types/agent-resume-input';
import type { AgentProgressEvent } from '../types/agent-progress-event';
import type { OnboardingInvocationInput } from '../types/onboarding-invocation-input';
import type { OnboardingInvocationResult } from '../types/onboarding-invocation-result';
import type { ThreadOwnershipReader } from '../types/thread-ownership-reader';
import {
  runOnboardingGraph,
  resumeOnboardingGraph,
  type OnboardingGraphDependencies,
} from '../workflows/onboarding/onboarding.graph';

class ThreadExecutionLock {
  private readonly tails = new Map<string, Promise<void>>();

  public async run<T>(threadId: string, work: () => Promise<T>): Promise<T> {
    const predecessor = this.tails.get(threadId) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = predecessor.then(() => current);
    this.tails.set(threadId, tail);
    await predecessor;
    try {
      return await work();
    } finally {
      release?.();
      if (this.tails.get(threadId) === tail) this.tails.delete(threadId);
    }
  }
}

function createProcessLocalThreadOwnership(): ThreadOwnershipReader {
  const bindings = new Map<string, string>();
  return {
    resolveCanonicalOwner: async (employeeCode) => {
      const canonical = employeeCode.trim().toUpperCase();
      if (!/^EMP-\d+$/.test(canonical)) return null;
      let bindingId = bindings.get(canonical);
      if (!bindingId) {
        bindingId = randomUUID();
        bindings.set(canonical, bindingId);
      }
      return { employeeCode: canonical, bindingId };
    },
    findOwnerEmployeeCodeByThreadId: async () => undefined,
  };
}

export class OnboardingAgentService implements AgentInvoker {
  private readonly dependencies: OnboardingGraphDependencies;
  private readonly executionLock = new ThreadExecutionLock();

  public constructor(
    dependencies: Omit<OnboardingGraphDependencies, 'checkpointer' | 'threadOwnership'> & {
      checkpointer?: BaseCheckpointSaver;
      threadOwnership?: ThreadOwnershipReader;
    },
  ) {
    this.dependencies = {
      ...dependencies,
      checkpointer: dependencies.checkpointer ?? new MemorySaver(),
      threadOwnership: dependencies.threadOwnership ?? createProcessLocalThreadOwnership(),
    };
  }

  public invoke(input: OnboardingInvocationInput): Promise<OnboardingInvocationResult> {
    const identifiers = this.resolveIdentifiers(input);
    return this.executionLock.run(identifiers.threadId, () =>
      runOnboardingGraph(this.dependencies, { ...input, ...identifiers }, identifiers.runId),
    );
  }

  public async *stream(input: OnboardingInvocationInput): AsyncIterable<AgentProgressEvent> {
    const events: AgentProgressEvent[] = [];
    let wake: (() => void) | undefined;
    let complete = false;
    let failure: unknown;
    const identifiers = this.resolveIdentifiers(input);
    const execution = this.executionLock
      .run(identifiers.threadId, () =>
        runOnboardingGraph(
          this.dependencies,
          { ...input, ...identifiers },
          identifiers.runId,
          (event) => {
            events.push(event);
            wake?.();
            wake = undefined;
          },
        ),
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

  public resume(input: AgentResumeInput): Promise<OnboardingInvocationResult> {
    const threadId = resolveThreadId(input.threadId);
    const correlationId = resolveSafeCorrelationId(input.correlationId, [threadId]);
    const runId = resolveSafeCorrelationId(input.runId, [threadId, correlationId]);
    return this.executionLock.run(threadId, () =>
      resumeOnboardingGraph(this.dependencies, {
        ...input,
        threadId,
        correlationId,
        runId,
      }),
    );
  }

  private resolveIdentifiers(input: OnboardingInvocationInput): {
    correlationId: string;
    runId: string;
    threadId: string;
  } {
    const threadId = resolveThreadId(input.threadId);
    const correlationId = resolveSafeCorrelationId(input.correlationId, [threadId]);
    return {
      correlationId,
      runId: resolveSafeCorrelationId(input.runId, [threadId, correlationId]),
      threadId,
    };
  }
}
