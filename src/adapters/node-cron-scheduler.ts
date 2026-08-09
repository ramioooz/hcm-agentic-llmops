import cron from 'node-cron';
import type { DailyScheduler, ScheduledJob } from '../types/daily-scheduler';

export class NodeCronScheduler implements DailyScheduler {
  public schedule(
    expression: string,
    callback: () => void | Promise<void>,
    options: { timezone: string },
  ): ScheduledJob {
    return cron.schedule(expression, callback, { timezone: options.timezone });
  }
}
