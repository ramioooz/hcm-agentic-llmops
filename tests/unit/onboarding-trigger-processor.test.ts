import { parseOnboardingTriggerEvent } from '../../src/contracts/onboarding-trigger-event';
import { OnboardingTriggerProcessor } from '../../src/services/onboarding-trigger-processor';
import type { AgentInvoker } from '../../src/types/agent-invoker';
import type {
  ProcessedEventClaim,
  ProcessedEventStore,
} from '../../src/types/processed-event-store';

const correlationId = '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0';
const event = parseOnboardingTriggerEvent({
  version: '1',
  eventId: 'event-onboarding-001',
  type: 'onboarding.review.requested',
  occurredAt: '2026-08-09T05:00:00.000Z',
  correlationId,
  data: {
    employeeCode: 'EMP-201',
    thresholdDays: 30,
    action: 'NOTIFY_MANAGER',
    threadId: 'onboarding-thread-001',
  },
});

function fakeStore(claim: ProcessedEventClaim['status'] = 'CLAIMED') {
  const claimEvent = jest.fn<
    Promise<ProcessedEventClaim>,
    [Parameters<ProcessedEventStore['claim']>[0]]
  >(async () => ({ status: claim }));
  const complete = jest.fn<Promise<void>, Parameters<ProcessedEventStore['complete']>>(
    async () => undefined,
  );
  const fail = jest.fn<Promise<void>, Parameters<ProcessedEventStore['fail']>>(
    async () => undefined,
  );
  return {
    store: { claim: claimEvent, complete, fail } satisfies ProcessedEventStore,
    claimEvent,
    complete,
    fail,
  };
}

function fakeInvoker() {
  const invoke = jest.fn<ReturnType<AgentInvoker['invoke']>, Parameters<AgentInvoker['invoke']>>(
    async (input) => ({
      httpStatus: 200,
      body: {
        status: 'COMPLETED',
        message: 'Employee onboarding review completed.',
        runId: 'run-event-001',
        correlationId: input.correlationId,
      },
    }),
  );
  return {
    invoker: { invoke, async *stream() {} } satisfies AgentInvoker,
    invoke,
  };
}

describe('OnboardingTriggerProcessor', () => {
  it('claims metadata, invokes the shared typed command, and links the completed run', async () => {
    const events = fakeStore();
    const agent = fakeInvoker();
    const processor = new OnboardingTriggerProcessor({
      events: events.store,
      agent: agent.invoker,
      automationActorEmployeeCode: 'EMP-100',
    });

    const outcome = await processor.process({ event, triggerType: 'RABBITMQ', attempt: 1 });

    expect(outcome).toEqual({ status: 'COMPLETED', runId: 'run-event-001' });
    expect(agent.invoke).toHaveBeenCalledWith({
      kind: 'ONBOARDING_REVIEW',
      targetEmployeeCode: 'EMP-201',
      thresholdDays: 30,
      notificationPolicy: 'EXPLICIT_REQUEST',
      actorEmployeeCode: 'EMP-100',
      correlationId,
      triggerType: 'RABBITMQ',
      eventId: 'event-onboarding-001',
      threadId: 'onboarding-thread-001',
    });
    expect(events.claimEvent).toHaveBeenCalledWith({
      eventId: 'event-onboarding-001',
      type: 'onboarding.review.requested',
      payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      correlationId,
      attempt: 1,
    });
    expect(events.complete).toHaveBeenCalledWith({
      eventId: 'event-onboarding-001',
      runId: 'run-event-001',
      threadId: 'onboarding-thread-001',
    });
    expect(JSON.stringify(events.claimEvent.mock.calls)).not.toContain('EMP-201');
  });

  it('does not repeat the graph or side effects for a completed duplicate', async () => {
    const events = fakeStore('DUPLICATE_COMPLETED');
    const agent = fakeInvoker();
    const processor = new OnboardingTriggerProcessor({
      events: events.store,
      agent: agent.invoker,
      automationActorEmployeeCode: 'EMP-100',
    });

    await expect(processor.process({ event, triggerType: 'WEBHOOK', attempt: 1 })).resolves.toEqual(
      { status: 'DUPLICATE' },
    );
    expect(agent.invoke).not.toHaveBeenCalled();
    expect(events.complete).not.toHaveBeenCalled();
  });

  it('rejects an event id reused with a different payload hash', async () => {
    const events = fakeStore('CONFLICT');
    const agent = fakeInvoker();
    const processor = new OnboardingTriggerProcessor({
      events: events.store,
      agent: agent.invoker,
      automationActorEmployeeCode: 'EMP-100',
    });

    await expect(
      processor.process({ event, triggerType: 'WEBHOOK', attempt: 1 }),
    ).rejects.toMatchObject({ code: 'EVENT_ID_CONFLICT' });
    expect(agent.invoke).not.toHaveBeenCalled();
  });

  it('records a stable error code when a retryable workflow attempt fails', async () => {
    const events = fakeStore();
    const agent = fakeInvoker();
    agent.invoke.mockResolvedValueOnce({
      httpStatus: 500,
      body: {
        status: 'FAILED',
        code: 'INTERNAL_ERROR',
        message: 'The workflow could not be completed.',
        runId: 'run-failed-001',
        correlationId,
      },
    });
    const processor = new OnboardingTriggerProcessor({
      events: events.store,
      agent: agent.invoker,
      automationActorEmployeeCode: 'EMP-100',
    });

    await expect(
      processor.process({ event, triggerType: 'RABBITMQ', attempt: 2 }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_FAILED' });
    expect(events.fail).toHaveBeenCalledWith({
      eventId: 'event-onboarding-001',
      errorCode: 'WORKFLOW_FAILED',
    });
  });
});
