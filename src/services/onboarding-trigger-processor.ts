import { createHash } from 'node:crypto';
import type { OnboardingTriggerEvent } from '../contracts/onboarding-trigger-event';
import { OnboardingReviewAction } from '../enums/onboarding.enum';
import { resolveSafeCorrelationId } from '../security/correlation-id';
import type { AgentInvoker } from '../types/agent-invoker';
import type { ProcessedEventStore } from '../types/processed-event-store';

export type TechnicalTriggerType = 'SCHEDULE' | 'WEBHOOK' | 'RABBITMQ';

export class TriggerProcessingError extends Error {
  public constructor(
    public readonly code: 'EVENT_ID_CONFLICT' | 'WORKFLOW_FAILED' | 'INTERNAL_ERROR',
  ) {
    super(code);
    this.name = 'TriggerProcessingError';
  }
}

function eventHash(event: OnboardingTriggerEvent): string {
  return createHash('sha256').update(JSON.stringify(event)).digest('hex');
}

export class OnboardingTriggerProcessor {
  public constructor(
    private readonly dependencies: {
      events: ProcessedEventStore;
      agent: AgentInvoker;
      automationActorEmployeeCode: string;
    },
  ) {}

  public async process(input: {
    event: OnboardingTriggerEvent;
    triggerType: TechnicalTriggerType;
    attempt: number;
  }): Promise<{ status: 'COMPLETED'; runId: string } | { status: 'DUPLICATE' }> {
    const correlationId = resolveSafeCorrelationId(input.event.correlationId);
    const claim = await this.dependencies.events.claim({
      eventId: input.event.eventId,
      type: input.event.type,
      payloadHash: eventHash(input.event),
      correlationId,
      attempt: input.attempt,
    });

    if (claim.status === 'CONFLICT') {
      throw new TriggerProcessingError('EVENT_ID_CONFLICT');
    }
    if (claim.status !== 'CLAIMED') {
      return { status: 'DUPLICATE' };
    }

    try {
      const result = await this.dependencies.agent.invoke({
        kind: 'ONBOARDING_REVIEW',
        targetEmployeeCode: input.event.data.employeeCode,
        thresholdDays: input.event.data.thresholdDays,
        notificationPolicy:
          input.triggerType === 'SCHEDULE'
            ? 'SYSTEM_POLICY'
            : input.event.data.action === OnboardingReviewAction.NotifyManager
              ? 'EXPLICIT_REQUEST'
              : 'NONE',
        actorEmployeeCode: this.dependencies.automationActorEmployeeCode,
        correlationId,
        triggerType: input.triggerType,
        eventId: input.event.eventId,
        threadId: input.event.data.threadId,
      });

      if (result.httpStatus >= 500) {
        await this.dependencies.events.fail({
          eventId: input.event.eventId,
          errorCode: 'WORKFLOW_FAILED',
        });
        throw new TriggerProcessingError('WORKFLOW_FAILED');
      }

      await this.dependencies.events.complete({
        eventId: input.event.eventId,
        runId: result.body.runId,
        threadId: result.body.threadId,
      });
      return { status: 'COMPLETED', runId: result.body.runId };
    } catch (error) {
      if (error instanceof TriggerProcessingError) throw error;
      await this.dependencies.events.fail({
        eventId: input.event.eventId,
        errorCode: 'INTERNAL_ERROR',
      });
      throw new TriggerProcessingError('INTERNAL_ERROR');
    }
  }
}
