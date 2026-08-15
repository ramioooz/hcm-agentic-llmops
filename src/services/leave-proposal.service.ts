import { LeaveErrorCode } from '../enums/error.enum';
import { ApplicationError } from '../errors/application.error';
import type { LeaveBalanceRecord } from '../types/leave-balance-record';
import type { LeavePolicyRecord } from '../types/leave-policy-record';

const dayMilliseconds = 86_400_000;

function parseDateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApplicationError(LeaveErrorCode.InvalidDates);
  }
  return date;
}

function isWorkingDay(date: Date): boolean {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

export function countWorkingDays(startDate: string, endDate: string): number {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (end < start) throw new ApplicationError(LeaveErrorCode.InvalidDates);
  let count = 0;
  for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += dayMilliseconds) {
    if (isWorkingDay(new Date(cursor))) count += 1;
  }
  return count;
}

export function evaluateLeaveProposal(input: {
  today: string;
  startDate: string;
  endDate: string;
  policy: LeavePolicyRecord;
  balance: LeaveBalanceRecord;
}) {
  const requestedWorkingDays = countWorkingDays(input.startDate, input.endDate);
  const dayBeforeStart = new Date(parseDateOnly(input.startDate).getTime() - dayMilliseconds)
    .toISOString()
    .slice(0, 10);
  const dayAfterToday = new Date(parseDateOnly(input.today).getTime() + dayMilliseconds)
    .toISOString()
    .slice(0, 10);
  const noticeWorkingDays =
    dayAfterToday > dayBeforeStart ? 0 : countWorkingDays(dayAfterToday, dayBeforeStart);
  const availableDays =
    input.balance.allocatedDays - input.balance.usedDays - input.balance.pendingDays;
  const reasons: string[] = [];
  if (noticeWorkingDays < input.policy.minimumNoticeWorkingDays) {
    reasons.push('INSUFFICIENT_NOTICE');
  }
  if (requestedWorkingDays > input.policy.maximumConsecutiveWorkingDays) {
    reasons.push('EXCEEDS_MAX_CONSECUTIVE_DAYS');
  }
  if (requestedWorkingDays > availableDays) reasons.push('INSUFFICIENT_BALANCE');

  return {
    leaveType: input.policy.code,
    startDate: input.startDate,
    endDate: input.endDate,
    requestedWorkingDays,
    noticeWorkingDays,
    availableDays,
    eligible: reasons.length === 0,
    reasons,
  };
}
