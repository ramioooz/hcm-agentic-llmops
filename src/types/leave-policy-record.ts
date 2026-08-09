export type LeavePolicyRecord = {
  id: string;
  code: 'ANNUAL';
  name: string;
  annualAllowanceDays: number;
  minimumNoticeWorkingDays: number;
  maximumConsecutiveWorkingDays: number;
  workWeek: readonly ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
  excludesHolidays: boolean;
};
