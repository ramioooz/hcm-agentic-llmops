export type ScheduledJob = {
  stop(): void;
};

export type DailyScheduler = {
  schedule(
    expression: string,
    callback: () => void | Promise<void>,
    options: { timezone: string },
  ): ScheduledJob;
};
