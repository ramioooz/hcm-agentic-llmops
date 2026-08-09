import type { PrismaClient } from '@prisma/client';
import { PrismaEmployeeRepository } from '../../src/repositories/employee.repository';
import { OnboardingScheduleTrigger } from '../../src/triggers/onboarding-schedule.trigger';
import type { DailyScheduler, ScheduledJob } from '../../src/types/daily-scheduler';

function fakeScheduler() {
  let callback: (() => Promise<void>) | undefined;
  const stop = jest.fn();
  const schedule = jest.fn<ScheduledJob, [string, () => Promise<void>, { timezone: string }]>(
    (_expression, scheduledCallback) => {
      callback = scheduledCallback;
      return { stop };
    },
  );
  return {
    scheduler: { schedule } satisfies DailyScheduler,
    schedule,
    stop,
    run: async () => {
      if (!callback) throw new Error('SCHEDULE_NOT_REGISTERED');
      await callback();
    },
  };
}

describe('OnboardingScheduleTrigger', () => {
  it('does not register the daily policy when scheduling is disabled', () => {
    const timer = fakeScheduler();
    const trigger = new OnboardingScheduleTrigger({
      enabled: false,
      scheduler: timer.scheduler,
      candidates: { findDueOnboardingReviewEmployeeCodes: jest.fn() },
      processor: { process: jest.fn() },
      clock: { now: () => new Date('2026-08-09T05:00:00.000Z') },
    });

    trigger.start();

    expect(timer.schedule).not.toHaveBeenCalled();
  });

  it('runs the system notification policy daily at 09:00 Asia/Dubai', async () => {
    const timer = fakeScheduler();
    const process = jest.fn().mockResolvedValue({ status: 'COMPLETED', runId: 'run-schedule-1' });
    const findDueOnboardingReviewEmployeeCodes = jest
      .fn()
      .mockResolvedValue(['EMP-201', 'EMP-202']);
    const trigger = new OnboardingScheduleTrigger({
      enabled: true,
      scheduler: timer.scheduler,
      candidates: { findDueOnboardingReviewEmployeeCodes },
      processor: { process },
      clock: { now: () => new Date('2026-08-09T05:00:00.000Z') },
    });

    trigger.start();
    await timer.run();
    trigger.stop();

    expect(timer.schedule).toHaveBeenCalledWith('0 9 * * *', expect.any(Function), {
      timezone: 'Asia/Dubai',
    });
    expect(findDueOnboardingReviewEmployeeCodes).toHaveBeenCalledWith({
      today: '2026-08-09',
      thresholdDays: 30,
    });
    expect(process).toHaveBeenCalledTimes(2);
    expect(process).toHaveBeenNthCalledWith(1, {
      event: {
        version: '1',
        eventId: expect.stringMatching(/^schedule-onboarding-v1-[a-f0-9]{32}$/),
        type: 'onboarding.review.requested',
        occurredAt: '2026-08-09T05:00:00.000Z',
        correlationId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        ),
        data: {
          employeeCode: 'EMP-201',
          thresholdDays: 30,
          action: 'NOTIFY_MANAGER',
          threadId: 'onboarding-daily-2026-08-09',
        },
      },
      triggerType: 'SCHEDULE',
      attempt: 1,
    });
    expect(timer.stop).toHaveBeenCalledTimes(1);
  });
});

describe('PrismaEmployeeRepository scheduled candidates', () => {
  it('queries only active employees with active reviews due inside the policy window', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([{ employeeCode: 'EMP-201' }, { employeeCode: 'EMP-202' }]);
    const database = { employee: { findMany } } as unknown as PrismaClient;
    const repository = new PrismaEmployeeRepository(database);

    await expect(
      repository.findDueOnboardingReviewEmployeeCodes({
        today: '2026-08-09',
        thresholdDays: 30,
      }),
    ).resolves.toEqual(['EMP-201', 'EMP-202']);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        reviewPeriods: {
          some: {
            status: 'ACTIVE',
            endDate: {
              gte: new Date('2026-08-09T00:00:00.000Z'),
              lte: new Date('2026-09-08T00:00:00.000Z'),
            },
          },
        },
      },
      orderBy: { employeeCode: 'asc' },
      select: { employeeCode: true },
    });
  });
});
