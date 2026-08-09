import { createHash, randomUUID } from 'node:crypto';
import { onboardingTriggerEventSchema } from '../contracts/onboarding-trigger-event';
import type { DailyScheduler, ScheduledJob } from '../types/daily-scheduler';
import type { OnboardingReviewCandidateReader } from '../types/onboarding-review-candidate-reader';
import type { OnboardingTriggerHandler } from '../types/onboarding-trigger-handler';

const SCHEDULE = '0 9 * * *';
const TIMEZONE = 'Asia/Dubai';
const THRESHOLD_DAYS = 30;

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function scheduledEventId(today: string, employeeCode: string): string {
  const digest = createHash('sha256')
    .update(`onboarding.schedule.v1:${today}:${employeeCode}`)
    .digest('hex')
    .slice(0, 32);
  return `schedule-onboarding-v1-${digest}`;
}

export class OnboardingScheduleTrigger {
  private job?: ScheduledJob;

  public constructor(
    private readonly dependencies: {
      enabled: boolean;
      scheduler: DailyScheduler;
      candidates: OnboardingReviewCandidateReader;
      processor: OnboardingTriggerHandler;
      clock: { now(): Date };
    },
  ) {}

  public start(): void {
    if (!this.dependencies.enabled || this.job) return;
    this.job = this.dependencies.scheduler.schedule(SCHEDULE, this.runPolicy, {
      timezone: TIMEZONE,
    });
  }

  public stop(): void {
    this.job?.stop();
    this.job = undefined;
  }

  private readonly runPolicy = async (): Promise<void> => {
    const now = this.dependencies.clock.now();
    const today = dateOnly(now);
    const employeeCodes = await this.dependencies.candidates.findDueOnboardingReviewEmployeeCodes({
      today,
      thresholdDays: THRESHOLD_DAYS,
    });
    await Promise.allSettled(
      employeeCodes.map((employeeCode) =>
        this.dependencies.processor.process({
          event: onboardingTriggerEventSchema.parse({
            version: '1',
            eventId: scheduledEventId(today, employeeCode),
            type: 'onboarding.review.requested',
            occurredAt: now.toISOString(),
            correlationId: randomUUID(),
            data: {
              employeeCode,
              thresholdDays: THRESHOLD_DAYS,
              action: 'NOTIFY_MANAGER',
              threadId: `onboarding-daily-${today}`,
            },
          }),
          triggerType: 'SCHEDULE',
          attempt: 1,
        }),
      ),
    );
  };
}
